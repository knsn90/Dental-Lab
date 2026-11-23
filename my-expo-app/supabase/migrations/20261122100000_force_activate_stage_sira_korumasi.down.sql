-- Geri al: sıra korumasız önceki sürüm
CREATE OR REPLACE FUNCTION public.force_activate_stage(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       UUID := auth.uid();
  v_user_type    TEXT; v_role TEXT;
  v_status       stage_status;
  v_default_tech UUID;
  v_work_order   UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  PERFORM public.assert_my_stage(p_stage_id);
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
     SET status = 'aktif', technician_id = COALESCE(technician_id, v_default_tech),
         assigned_at = COALESCE(assigned_at, NOW()), started_at = NULL
   WHERE id = p_stage_id;
  UPDATE public.work_orders SET current_stage_id = p_stage_id, status = 'asamada'
   WHERE id = v_work_order;
  RETURN TRUE;
END;
$function$;
