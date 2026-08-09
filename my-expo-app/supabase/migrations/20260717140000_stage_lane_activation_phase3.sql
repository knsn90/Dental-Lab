-- 20260717140000 — Paralel şerit · FAZ 3: aktivasyon + ilerleme şerit-kapsamlı
-- ─────────────────────────────────────────────────────────────────────────────
-- "Sipariş başına 1 aktif" → "ŞERİT (lane) başına 1 aktif". Tek şeritte tek lane
-- (=1) olduğundan tüm bu değişiklikler NO-OP (bugünkü davranış birebir korunur).
--
--   • approve_triage        → HER şeridin ilk bekliyor aşamasını aktive eder.
--   • complete_stage_simple → sonraki aşamayı AYNI şerit içinde bulur; sipariş
--                             'teslimata_hazir' yalnız TÜM şeritler bitince.
--   • advance_to_next_stage → aynı şerit-içi sonraki; 'kalite_kontrol' yalnız
--                             tüm şeritler bitince.
--
-- work_orders.current_stage_id "temsilci" pointer olur (en düşük lane/sequence
-- aktif) — liste kartları/etiketler değişmeden çalışır. Faz 4 client şeritleri
-- doğrudan lane'e göre gruplayıp gösterecek.
--
-- KAPSAM DIŞI (Faz 3b, gerekirse): start_stage_simple (stage_id bazlı, lane
-- gerekmiyor), revert_stage, return_to_stage (QC), admin_* override'lar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) approve_triage: her şeridin ilk aşamasını aktive et ───────────────────
CREATE OR REPLACE FUNCTION public.approve_triage(p_order_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     UUID := auth.uid();
  v_user_type  TEXT; v_role TEXT;
  v_lane       INTEGER;
  v_first_id   UUID;
  v_first_grp  INTEGER;
  v_lead       UUID;   -- en düşük lane'in ilk aşaması → current_stage_id temsilci
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.work_orders WHERE id = p_order_id AND triaged_at IS NOT NULL) THEN
    RAISE EXCEPTION 'order not triaged yet';
  END IF;

  -- Her şerit için ilk (en düşük sequence) bekliyor aşamayı aktive et.
  FOR v_lane IN
    SELECT DISTINCT lane FROM public.order_stages
     WHERE work_order_id = p_order_id AND status = 'bekliyor'
     ORDER BY lane
  LOOP
    SELECT os.id, os.parallel_group INTO v_first_id, v_first_grp
      FROM public.order_stages os
     WHERE os.work_order_id = p_order_id AND os.lane = v_lane AND os.status = 'bekliyor'
     ORDER BY os.sequence_order LIMIT 1;
    IF v_first_id IS NULL THEN CONTINUE; END IF;
    IF v_lead IS NULL THEN v_lead := v_first_id; END IF;

    IF v_first_grp IS NOT NULL THEN
      -- Şerit-içi paralel grup: o grubun tüm bekliyor aşamalarını aktive et
      UPDATE public.order_stages os
         SET status = 'aktif',
             technician_id = COALESCE(os.technician_id, ls.default_technician_id),
             assigned_at = COALESCE(os.assigned_at, NOW()),
             started_at = NULL
        FROM public.lab_stations ls
       WHERE os.station_id = ls.id
         AND os.work_order_id = p_order_id AND os.lane = v_lane
         AND os.status = 'bekliyor' AND os.parallel_group = v_first_grp;
    ELSE
      UPDATE public.order_stages os
         SET status = 'aktif',
             technician_id = COALESCE(os.technician_id, ls.default_technician_id),
             assigned_at = COALESCE(os.assigned_at, NOW()),
             started_at = NULL
        FROM public.lab_stations ls
       WHERE os.id = v_first_id AND os.station_id = ls.id;
    END IF;
  END LOOP;

  UPDATE public.work_orders
     SET triage_approved_at = NOW(),
         triage_approved_by = v_caller,
         current_stage_id   = v_lead,
         status             = CASE WHEN v_lead IS NOT NULL THEN 'asamada' ELSE status END
   WHERE id = p_order_id;

  RETURN TRUE;
END;
$function$;

-- ── 2) complete_stage_simple: şerit-içi sonraki; sipariş-bitişi tüm şeritler ──
CREATE OR REPLACE FUNCTION public.complete_stage_simple(p_stage_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller         UUID := auth.uid();
  v_stage_tech     UUID; v_status stage_status;
  v_user_type      TEXT; v_role TEXT;
  v_work_order_id  UUID; v_seq INT; v_next_id UUID; v_next_seq INT;
  v_auto_prog      BOOLEAN;
  v_safety_loop    INT := 0;
  v_station_id     UUID;
  v_stage_kind     TEXT;
  v_approval_req   BOOLEAN;
  v_approval_stat  TEXT;
  v_lane           INT;   -- FAZ 3: aşamanın şeridi
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, work_order_id, sequence_order, station_id, lane
    INTO v_stage_tech, v_status, v_work_order_id, v_seq, v_station_id, v_lane
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_stage_tech <> v_caller AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  UPDATE public.order_stages SET status='tamamlandi', completed_at=NOW() WHERE id = p_stage_id;

  -- DESIGN approval gate (değişmedi — sipariş seviyesi)
  v_stage_kind := _stage_for_station(v_station_id);
  SELECT doctor_approval_required, doctor_approval_status
    INTO v_approval_req, v_approval_stat
    FROM public.work_orders WHERE id = v_work_order_id;

  IF v_stage_kind = 'DESIGN'
     AND COALESCE(v_approval_req, FALSE) = TRUE
     AND COALESCE(v_approval_stat, '') NOT IN ('approved')
  THEN
    UPDATE public.work_orders
       SET doctor_approval_status = 'pending', doctor_approval_required = TRUE,
           status = 'tasarim_onayi_bekleniyor', current_stage_id = NULL
     WHERE id = v_work_order_id;
    BEGIN PERFORM generate_doctor_approval_token(v_work_order_id);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN TRUE;
  END IF;

  -- Normal akış: AYNI ŞERİT içinde sonraki bekleyen aşamaya geç
  v_next_seq := v_seq;
  LOOP
    v_safety_loop := v_safety_loop + 1;
    EXIT WHEN v_safety_loop > 20;

    SELECT os.id, ls.auto_progress, os.sequence_order
      INTO v_next_id, v_auto_prog, v_next_seq
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.work_order_id = v_work_order_id
       AND os.lane = v_lane                       -- FAZ 3: şerit-içi
       AND os.sequence_order > v_next_seq
       AND os.status = 'bekliyor'
     ORDER BY os.sequence_order LIMIT 1;

    EXIT WHEN v_next_id IS NULL;

    IF v_auto_prog THEN
      UPDATE public.order_stages
         SET status='tamamlandi', technician_id = COALESCE(technician_id, v_caller),
             assigned_at=COALESCE(assigned_at, NOW()), started_at=COALESCE(started_at, NOW()),
             completed_at=NOW()
       WHERE id = v_next_id;
    ELSE
      UPDATE public.order_stages
         SET status='aktif', assigned_at=COALESCE(assigned_at, NOW()), started_at = NULL
       WHERE id = v_next_id;
      UPDATE public.work_orders SET current_stage_id = v_next_id, status = 'asamada'
       WHERE id = v_work_order_id;
      RETURN TRUE;
    END IF;
  END LOOP;

  -- Bu şerit bitti. Sipariş genelinde başka şerit sürüyor mu?
  IF EXISTS (
    SELECT 1 FROM public.order_stages
     WHERE work_order_id = v_work_order_id AND status IN ('bekliyor','aktif')
  ) THEN
    -- Diğer şeritler devam ediyor → sipariş 'asamada' kalır, temsilci pointer güncellenir
    UPDATE public.work_orders
       SET current_stage_id = (
             SELECT id FROM public.order_stages
              WHERE work_order_id = v_work_order_id AND status = 'aktif'
              ORDER BY lane, sequence_order LIMIT 1
           ),
           status = 'asamada'
     WHERE id = v_work_order_id;
  ELSE
    -- Tüm şeritler bitti
    UPDATE public.work_orders SET current_stage_id = NULL, status = 'teslimata_hazir'
     WHERE id = v_work_order_id;
  END IF;
  RETURN TRUE;
END;
$function$;

-- ── 3) advance_to_next_stage: şerit-içi sonraki; kalite yalnız tüm şeritler ──
CREATE OR REPLACE FUNCTION public.advance_to_next_stage(p_work_order_id uuid, p_approver_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_current      order_stages%ROWTYPE;
  v_next         order_stages%ROWTYPE;
  v_dr_approval  TEXT;
BEGIN
  SELECT doctor_approval_status INTO v_dr_approval FROM work_orders WHERE id = p_work_order_id;
  IF v_dr_approval = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hekim tasarım onayı bekleniyor, aşama ilerleyemez');
  END IF;

  SELECT * INTO v_current FROM order_stages
   WHERE work_order_id = p_work_order_id AND status IN ('tamamlandi', 'aktif')
   ORDER BY lane, sequence_order LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aktif aşama bulunamadı');
  END IF;

  UPDATE order_stages SET
    status = 'onaylandi', approved_at = NOW(), approved_by = p_approver_id,
    manager_note = COALESCE(p_note, manager_note)
  WHERE id = v_current.id;

  INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, v_current.id, 'aşama_onaylandi', p_approver_id,
    jsonb_build_object('sequence', v_current.sequence_order));

  -- Sonraki aşama AYNI ŞERİT içinde
  SELECT * INTO v_next FROM order_stages
   WHERE work_order_id = p_work_order_id AND lane = v_current.lane
     AND sequence_order > v_current.sequence_order AND status = 'bekliyor'
   ORDER BY sequence_order LIMIT 1;

  IF FOUND THEN
    UPDATE order_stages SET status = 'aktif', assigned_at = NOW() WHERE id = v_next.id;
    UPDATE work_orders SET current_stage_id = v_next.id, status = 'asamada' WHERE id = p_work_order_id;
    RETURN jsonb_build_object('ok', true, 'next_stage_id', v_next.id, 'station', v_next.station_id);
  ELSE
    -- Bu şerit bitti. Başka şerit sürüyorsa sipariş 'asamada' kalır.
    IF EXISTS (
      SELECT 1 FROM order_stages
       WHERE work_order_id = p_work_order_id AND status IN ('bekliyor','aktif')
    ) THEN
      UPDATE work_orders SET
        current_stage_id = (SELECT id FROM order_stages WHERE work_order_id = p_work_order_id AND status='aktif' ORDER BY lane, sequence_order LIMIT 1),
        status = 'asamada'
      WHERE id = p_work_order_id;
      RETURN jsonb_build_object('ok', true, 'next_stage_id', NULL, 'status', 'asamada');
    ELSE
      UPDATE work_orders SET current_stage_id = NULL, status = 'kalite_kontrol' WHERE id = p_work_order_id;
      INSERT INTO order_events (work_order_id, event_type, actor_id)
      VALUES (p_work_order_id, 'kalite_gecti', p_approver_id);
      RETURN jsonb_build_object('ok', true, 'next_stage_id', NULL, 'status', 'kalite_kontrol');
    END IF;
  END IF;
END;
$function$;

NOTIFY pgrst, 'reload schema';
