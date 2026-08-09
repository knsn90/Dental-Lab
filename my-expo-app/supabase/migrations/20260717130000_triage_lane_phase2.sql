-- 20260717130000 — Paralel şerit · FAZ 2: triage_order lane farkındalığı
-- ─────────────────────────────────────────────────────────────────────────────
-- Client'ın çağırdığı overload = triage_order(uuid, jsonb, uuid) [p_first_tech_id].
-- (Ayrıca kullanılmayan bir triage_order(uuid,jsonb,date) overload'ı var — client
--  onu çağırmıyor, dokunulmadı.)
--
-- Değişiklik: her plan satırı opsiyonel `lane` (işlem şeridi) taşır (default 1).
--   • lane order_stages'e yazılır (INSERT + UPDATE).
--   • Upsert eşleşmesine lane eklendi → aynı istasyondan geçen İKİ şerit artık
--     tek satıra çökmez (örn. iki işlem de "CAM Hazırlık"tan geçebilir).
-- NO-OP: satırlarda lane yoksa v_lane=1 → çıktı bugünküyle birebir aynı.
--
-- SECURITY INVOKER + imza + grant KORUNUR (CREATE OR REPLACE). parallel_group
-- (ETA eşzamanlılık kavramı) DOKUNULMADI — o ayrı eksen.
--
-- KAPSAM DIŞI (Faz 3): approve_triage'ın her ŞERİDİN ilk aşamasını aktive etmesi;
-- advance/complete/start/revert/return_to_stage'in "sipariş başına 1 aktif" →
-- "lane başına 1 aktif" olması. Bu fazda yalnız şeritli PLAN üretimi doğrulanır.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.triage_order(p_order_id uuid, p_lines jsonb, p_first_tech_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_line          jsonb;
  v_lab_id        uuid;
  v_existing_id   uuid;
  v_stage_id      uuid;
  v_status        text;
  v_first_stage   uuid;
  v_tech_id       uuid;
  v_default_tech  uuid;
  v_station_id    uuid;
  v_est_min       integer;
  v_lane          integer;   -- FAZ 2: işlem şeridi (default 1)
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
    v_station_id := (v_line->>'station_id')::uuid;
    v_lane := COALESCE(NULLIF(v_line->>'lane', '')::int, 1);   -- FAZ 2

    IF v_status = 'skipped'
       AND (v_line->>'skipped_reason' IS NULL OR length(trim(v_line->>'skipped_reason')) = 0) THEN
      RAISE EXCEPTION 'Skipped stage requires reason';
    END IF;

    -- 'aktif' istense bile onay öncesi 'bekliyor' a düşür
    IF v_status = 'aktif' THEN v_status := 'bekliyor'; END IF;

    -- İstasyon varsayılanları: teknisyen + tahmini süre
    SELECT default_technician_id, est_duration_min
      INTO v_default_tech, v_est_min
      FROM public.lab_stations WHERE id = v_station_id;

    v_tech_id := NULLIF(v_line->>'technician_id', '')::uuid;
    IF v_tech_id IS NULL THEN
      v_tech_id := v_default_tech;
    END IF;

    -- FAZ 2: eşleşmeye lane eklendi (aynı istasyon farklı şeritte 2 satır olabilir)
    SELECT id INTO v_existing_id
    FROM public.order_stages
    WHERE work_order_id = p_order_id
      AND station_id = v_station_id
      AND lane = v_lane
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.order_stages
      SET sequence_order    = (v_line->>'sequence_order')::int,
          lane              = v_lane,
          status            = v_status::stage_status,
          technician_id     = v_tech_id,
          is_critical       = COALESCE((v_line->>'is_critical')::boolean, FALSE),
          parallel_group    = NULLIF(v_line->>'parallel_group', '')::int,
          estimated_minutes = COALESCE(v_est_min, estimated_minutes),
          skipped_reason    = NULLIF(v_line->>'skipped_reason', ''),
          skipped_at        = CASE WHEN v_status = 'skipped' THEN NOW() ELSE NULL END,
          skipped_by        = CASE WHEN v_status = 'skipped' THEN auth.uid() ELSE NULL END,
          assigned_at       = NULL,
          started_at        = NULL
      WHERE id = v_existing_id
      RETURNING id INTO v_stage_id;
    ELSE
      INSERT INTO public.order_stages (
        work_order_id, station_id, technician_id, sequence_order, lane,
        status, is_critical, parallel_group, estimated_minutes,
        skipped_reason, skipped_at, skipped_by,
        assigned_at, started_at
      ) VALUES (
        p_order_id,
        v_station_id,
        v_tech_id,
        (v_line->>'sequence_order')::int,
        v_lane,
        v_status::stage_status,
        COALESCE((v_line->>'is_critical')::boolean, FALSE),
        NULLIF(v_line->>'parallel_group', '')::int,
        v_est_min,
        NULLIF(v_line->>'skipped_reason', ''),
        CASE WHEN v_status = 'skipped' THEN NOW() END,
        CASE WHEN v_status = 'skipped' THEN auth.uid() END,
        NULL, NULL
      )
      RETURNING id INTO v_stage_id;
    END IF;

    IF v_status = 'bekliyor' AND v_first_stage IS NULL THEN
      v_first_stage := v_stage_id;
    END IF;
  END LOOP;

  UPDATE public.work_orders
     SET triaged_at         = NOW(),
         triaged_by         = auth.uid(),
         triage_approved_at = NULL,
         triage_approved_by = NULL,
         current_stage_id   = NULL,
         status             = 'alindi'
   WHERE id = p_order_id;

  RETURN v_first_stage;
END;
$function$;

NOTIFY pgrst, 'reload schema';
