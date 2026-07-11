-- ============================================================
-- 20260512100000 — Manager/admin force-activate stage
--
-- Bir aşama 'bekliyor' durumdaysa yöneticinin manuel olarak
-- 'aktif'e çekebilmesi için. Önceki aşamalar bitmemiş olabilir
-- (manuel müdahale). work_orders.current_stage_id güncellenir.
-- ============================================================

CREATE OR REPLACE FUNCTION public.force_activate_stage(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_user_type    TEXT; v_role TEXT;
  v_status       stage_status;
  v_default_tech UUID;
  v_work_order   UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT os.status, ls.default_technician_id, os.work_order_id
    INTO v_status, v_default_tech, v_work_order
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.id = p_stage_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status <> 'bekliyor' THEN
    RAISE EXCEPTION 'stage must be bekliyor (current: %)', v_status;
  END IF;

  UPDATE public.order_stages
     SET status        = 'aktif',
         technician_id = COALESCE(technician_id, v_default_tech),
         assigned_at   = COALESCE(assigned_at, NOW()),
         started_at    = NULL
   WHERE id = p_stage_id;

  UPDATE public.work_orders
     SET current_stage_id = p_stage_id,
         status           = 'asamada'
   WHERE id = v_work_order;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.force_activate_stage(UUID) TO authenticated;
