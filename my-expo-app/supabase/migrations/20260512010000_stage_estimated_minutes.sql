-- ============================================================
-- 20260512010000 — order_stages.estimated_minutes + RPC update
--
-- Teknisyen "İşe Başla" derken takribi süreyi (dakika) girer.
-- Aktif aşama için ilerleme %'si = elapsed / estimated * 100
-- (üst katmanda hesaplanır)
-- ============================================================

-- 1) Kolon
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS estimated_minutes INT NULL;

COMMENT ON COLUMN public.order_stages.estimated_minutes IS
  'Teknisyenin başlangıçta verdiği takribi süre (dakika). NULL = tahmin yok.';

-- 2) start_stage_simple — opsiyonel estimated_minutes parametresi
CREATE OR REPLACE FUNCTION public.start_stage_simple(
  p_stage_id          UUID,
  p_estimated_minutes INT DEFAULT NULL
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

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_tech IS NOT NULL AND v_tech <> v_caller
     AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Idempotent: zaten başlamışsa estimated güncellenebilir ama timing değişmez
  IF v_started IS NOT NULL THEN
    IF p_estimated_minutes IS NOT NULL THEN
      UPDATE public.order_stages
         SET estimated_minutes = GREATEST(1, p_estimated_minutes)
       WHERE id = p_stage_id;
    END IF;
    RETURN TRUE;
  END IF;

  v_wait_secs := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_assigned, NOW())))::INT);

  UPDATE public.order_stages
     SET started_at            = NOW(),
         technician_id         = COALESCE(technician_id, v_caller),
         queue_waiting_seconds = COALESCE(queue_waiting_seconds, 0) + v_wait_secs,
         estimated_minutes     = CASE
           WHEN p_estimated_minutes IS NOT NULL THEN GREATEST(1, p_estimated_minutes)
           ELSE estimated_minutes
         END
   WHERE id = p_stage_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_stage_simple(UUID, INT) TO authenticated;
