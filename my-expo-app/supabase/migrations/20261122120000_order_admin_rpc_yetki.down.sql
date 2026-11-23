-- Geri alma: eski (açıklı) gövdeler + anon yetkisi. YALNIZ acil geri dönüş için.
CREATE OR REPLACE FUNCTION public.archive_order(p_order_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can archive orders' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.work_orders SET is_archived = TRUE, archived_at = NOW(), archived_by = auth.uid()
  WHERE id = p_order_id AND is_archived = FALSE;
  RETURN p_order_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.restore_order(p_order_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can restore orders' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.work_orders SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE id = p_order_id;
  RETURN p_order_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.hard_delete_order(p_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can permanently delete orders' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.work_orders WHERE id = p_order_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.archive_order(uuid), public.restore_order(uuid), public.hard_delete_order(uuid) TO anon;
DROP FUNCTION IF EXISTS public._assert_order_admin(uuid);
