-- ============================================================
-- 20260509080000 — start_stage_simple + assignment/started ayrıştırma
--
-- Yeni akış:
--   • Atama        → status='aktif', assigned_at=NOW(), started_at=NULL
--                    (teknisyen kuyrukta görür, süre işlemiyor)
--   • İşe Başla    → start_stage_simple → started_at=NOW(),
--                    queue_waiting_seconds += (started_at - assigned_at)
--   • Tamamla      → complete_stage_simple (mevcut)
--
-- Bu sayede "kuyrukta bekleme" süresi hesaplanır,
-- aktif iş başlama anına kadar TOPLAM SÜRE / BU AŞAMA ticking BAŞLAMAZ.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) start_stage_simple — teknisyen "İşe Başla" der
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_stage_simple(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_tech       UUID;
  v_status     stage_status;
  v_started    TIMESTAMPTZ;
  v_assigned   TIMESTAMPTZ;
  v_user_type  TEXT;
  v_role       TEXT;
  v_wait_secs  INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, started_at, assigned_at
    INTO v_tech, v_status, v_started, v_assigned
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  -- Yetki: ya atanan teknisyen ya manager/admin
  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_tech IS NOT NULL AND v_tech <> v_caller
     AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Idempotent: zaten başlamışsa noop
  IF v_started IS NOT NULL THEN RETURN TRUE; END IF;

  -- Kuyruk bekleme süresi = started_at - assigned_at
  v_wait_secs := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_assigned, NOW())))::INT);

  -- Eğer technician_id yoksa caller'ı sahiplenir (havuzdan "Bana Al" akışı)
  UPDATE public.order_stages
     SET started_at            = NOW(),
         technician_id         = COALESCE(technician_id, v_caller),
         queue_waiting_seconds = COALESCE(queue_waiting_seconds, 0) + v_wait_secs
   WHERE id = p_stage_id;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_stage_simple(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) complete_stage_simple — sıradaki aşamayı aktif ederken
--    started_at SET ETME (önceki sürüm SET ediyordu)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_stage_simple(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_stage_tech    UUID; v_status stage_status;
  v_user_type     TEXT; v_role TEXT;
  v_work_order_id UUID; v_seq INT; v_next_id UUID; v_next_seq INT;
  v_auto_prog     BOOLEAN;
  v_safety_loop   INT := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, work_order_id, sequence_order
    INTO v_stage_tech, v_status, v_work_order_id, v_seq
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_stage_tech <> v_caller AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  UPDATE public.order_stages
     SET status='tamamlandi', completed_at=NOW()
   WHERE id = p_stage_id;

  v_next_seq := v_seq;

  LOOP
    v_safety_loop := v_safety_loop + 1;
    EXIT WHEN v_safety_loop > 20;

    SELECT os.id, ls.auto_progress, os.sequence_order
      INTO v_next_id, v_auto_prog, v_next_seq
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.work_order_id = v_work_order_id
       AND os.sequence_order > v_next_seq
       AND os.status = 'bekliyor'
     ORDER BY os.sequence_order
     LIMIT 1;

    EXIT WHEN v_next_id IS NULL;

    IF v_auto_prog THEN
      -- Otomatik aşama: caller'ı audit aktörü olarak yaz, hemen tamamla
      UPDATE public.order_stages
         SET status='tamamlandi',
             technician_id = COALESCE(technician_id, v_caller),
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at=COALESCE(started_at, NOW()),
             completed_at=NOW()
       WHERE id = v_next_id;
    ELSE
      -- Manuel aşama: aktif et — assigned_at yaz, started_at NULL kalsın.
      -- Teknisyen "İşe Başla" basana kadar süre işlemez.
      UPDATE public.order_stages
         SET status='aktif',
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at = NULL
       WHERE id = v_next_id;
      UPDATE public.work_orders
         SET current_stage_id = v_next_id,
             status = 'asamada'
       WHERE id = v_work_order_id;
      RETURN TRUE;
    END IF;
  END LOOP;

  UPDATE public.work_orders
     SET current_stage_id = NULL, status = 'kalite_kontrol'
   WHERE id = v_work_order_id;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_stage_simple(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) triage_order — ilk aktif aşamayı atarken started_at SET ETME
--    (mevcut sürüm started_at=NOW() yazıyordu)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.triage_order(
  p_order_id        uuid,
  p_lines           jsonb,
  p_first_tech_id   uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_line          jsonb;
  v_lab_id        uuid;
  v_existing_id   uuid;
  v_stage_id      uuid;
  v_status        text;
  v_first_active  uuid;
BEGIN
  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_orders
    WHERE id = p_order_id AND triaged_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Order already triaged' USING ERRCODE = 'P0001';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_status := v_line->>'status';

    IF v_status = 'skipped'
       AND (v_line->>'skipped_reason' IS NULL OR length(trim(v_line->>'skipped_reason')) = 0) THEN
      RAISE EXCEPTION 'Skipped stage requires reason';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.order_stages
    WHERE work_order_id = p_order_id
      AND station_id = (v_line->>'station_id')::uuid
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.order_stages
      SET sequence_order  = (v_line->>'sequence_order')::int,
          status          = v_status::stage_status,
          technician_id   = NULLIF(v_line->>'technician_id', '')::uuid,
          is_critical     = COALESCE((v_line->>'is_critical')::boolean, FALSE),
          skipped_reason  = NULLIF(v_line->>'skipped_reason', ''),
          skipped_at      = CASE WHEN v_status = 'skipped' THEN NOW() ELSE NULL END,
          skipped_by      = CASE WHEN v_status = 'skipped' THEN auth.uid() ELSE NULL END,
          assigned_at     = CASE WHEN v_status = 'aktif' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
          -- started_at: NULL kalsın — teknisyen "İşe Başla" der
          started_at      = NULL
      WHERE id = v_existing_id
      RETURNING id INTO v_stage_id;
    ELSE
      INSERT INTO public.order_stages (
        work_order_id, station_id, technician_id, sequence_order,
        status, is_critical,
        skipped_reason, skipped_at, skipped_by,
        assigned_at, started_at
      ) VALUES (
        p_order_id,
        (v_line->>'station_id')::uuid,
        NULLIF(v_line->>'technician_id', '')::uuid,
        (v_line->>'sequence_order')::int,
        v_status::stage_status,
        COALESCE((v_line->>'is_critical')::boolean, FALSE),
        NULLIF(v_line->>'skipped_reason', ''),
        CASE WHEN v_status = 'skipped' THEN NOW() END,
        CASE WHEN v_status = 'skipped' THEN auth.uid() END,
        CASE WHEN v_status = 'aktif' THEN NOW() END,
        NULL  -- started_at: teknisyen başlatana kadar boş
      )
      RETURNING id INTO v_stage_id;
    END IF;

    IF v_status = 'aktif' AND v_first_active IS NULL THEN
      v_first_active := v_stage_id;
    END IF;
  END LOOP;

  -- Triaj işaretle
  UPDATE public.work_orders
     SET triaged_at = NOW(),
         triaged_by = auth.uid(),
         current_stage_id = v_first_active,
         status = CASE WHEN v_first_active IS NOT NULL THEN 'asamada' ELSE status END
   WHERE id = p_order_id;

  RETURN v_first_active;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.triage_order(uuid, jsonb, uuid) TO authenticated;
