-- ============================================================
-- 20260512040000 — Triage approval workflow
--
-- Akış:
--   1) Planlama (triage_order) → tüm aşamalar 'bekliyor' kalır,
--      ilk aşama AKTİF edilmez; default tech atamaları yapılır;
--      work_orders.triage_approved_at = NULL.
--   2) Müdür / admin approve_triage(order_id) çağırır → ilk
--      'bekliyor' (non-skipped) aşama 'aktif' olur, work_orders
--      status='asamada', triage_approved_at = NOW().
--   3) reject_triage opsiyonel — triaj iptal edip yeniden plan
--      isteyebilir; bu sürümde sadece approve eklendi.
--
-- Mevcut triaged ama yeni kolonu olmayan siparişler için
-- triage_approved_at = triaged_at backfill edilir (geriye dönük
-- onaylı sayılır).
-- ============================================================

BEGIN;

-- 1) Kolonlar
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS triage_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triage_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill — daha önce triaged olanlar onaylı kabul edilir
UPDATE public.work_orders
   SET triage_approved_at = COALESCE(triage_approved_at, triaged_at)
 WHERE triaged_at IS NOT NULL
   AND triage_approved_at IS NULL;

-- 2) triage_order — artık ilk aşamayı aktif etmiyor; hepsi 'bekliyor'
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
  v_first_stage   uuid;
  v_tech_id       uuid;
  v_default_tech  uuid;
  v_station_id    uuid;
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

    IF v_status = 'skipped'
       AND (v_line->>'skipped_reason' IS NULL OR length(trim(v_line->>'skipped_reason')) = 0) THEN
      RAISE EXCEPTION 'Skipped stage requires reason';
    END IF;

    -- 'aktif' istense bile onay öncesi 'bekliyor' a düşür
    IF v_status = 'aktif' THEN v_status := 'bekliyor'; END IF;

    v_tech_id := NULLIF(v_line->>'technician_id', '')::uuid;
    IF v_tech_id IS NULL THEN
      SELECT default_technician_id INTO v_default_tech
        FROM public.lab_stations WHERE id = v_station_id;
      v_tech_id := v_default_tech;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.order_stages
    WHERE work_order_id = p_order_id
      AND station_id = v_station_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.order_stages
      SET sequence_order  = (v_line->>'sequence_order')::int,
          status          = v_status::stage_status,
          technician_id   = v_tech_id,
          is_critical     = COALESCE((v_line->>'is_critical')::boolean, FALSE),
          skipped_reason  = NULLIF(v_line->>'skipped_reason', ''),
          skipped_at      = CASE WHEN v_status = 'skipped' THEN NOW() ELSE NULL END,
          skipped_by      = CASE WHEN v_status = 'skipped' THEN auth.uid() ELSE NULL END,
          assigned_at     = NULL,
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
        v_station_id,
        v_tech_id,
        (v_line->>'sequence_order')::int,
        v_status::stage_status,
        COALESCE((v_line->>'is_critical')::boolean, FALSE),
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

  -- Triaj kaydı — onay BEKLİYOR
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
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.triage_order(uuid, jsonb, uuid) TO authenticated;

-- 3) approve_triage — yalnız müdür/admin
CREATE OR REPLACE FUNCTION public.approve_triage(
  p_order_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_user_type  TEXT; v_role TEXT;
  v_first_id   UUID;
  v_default    UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
    WHERE id = p_order_id AND triaged_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'order not triaged yet';
  END IF;

  -- İlk non-skipped bekliyor aşamayı aktif et
  SELECT os.id, ls.default_technician_id
    INTO v_first_id, v_default
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.work_order_id = p_order_id
     AND os.status = 'bekliyor'
   ORDER BY os.sequence_order
   LIMIT 1;

  IF v_first_id IS NOT NULL THEN
    UPDATE public.order_stages
       SET status='aktif',
           technician_id = COALESCE(technician_id, v_default),
           assigned_at = COALESCE(assigned_at, NOW()),
           started_at = NULL
     WHERE id = v_first_id;
  END IF;

  UPDATE public.work_orders
     SET triage_approved_at = NOW(),
         triage_approved_by = v_caller,
         current_stage_id   = v_first_id,
         status             = CASE WHEN v_first_id IS NOT NULL THEN 'asamada' ELSE status END
   WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_triage(UUID) TO authenticated;

COMMIT;
