-- archive_order / restore_order / hard_delete_order: yetki açığı kapatılıyor.
-- Sorun:
--   1) `IF v_user_type <> 'admin'` — oturum yoksa (anon) ya da profil yoksa
--      v_user_type NULL olur; NULL <> 'admin' NULL döner, IF girilmez ve işlem
--      YAPILIRDI. Üç işlev anon'a da açıktı → kimliği bilen herkes siparişi silebilirdi.
--   2) Lab kontrolü yoktu → A lab'ının admini B lab'ının siparişine dokunabilirdi.
-- Çözüm: oturum şart, admin şart (IS DISTINCT FROM), sipariş çağıranın lab'ında
-- olmalı (platform admini muaf), anon'dan EXECUTE yetkisi alınır.

CREATE OR REPLACE FUNCTION public._assert_order_admin(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_type text;
  v_my_lab    uuid;
  v_order_lab uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF public.is_platform_admin() THEN RETURN; END IF;

  SELECT user_type, lab_id INTO v_user_type, v_my_lab FROM public.profiles WHERE id = auth.uid();
  IF v_user_type IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admin can manage orders' USING ERRCODE = 'P0001';
  END IF;

  SELECT lab_id INTO v_order_lab FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_my_lab IS NULL OR v_order_lab IS DISTINCT FROM v_my_lab THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_order_admin(p_order_id);

  UPDATE public.work_orders
  SET is_archived = TRUE,
      archived_at = NOW(),
      archived_by = auth.uid()
  WHERE id = p_order_id
    AND is_archived = FALSE;

  RETURN p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_order_admin(p_order_id);

  UPDATE public.work_orders
  SET is_archived = FALSE,
      archived_at = NULL,
      archived_by = NULL
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hard_delete_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_order_admin(p_order_id);
  DELETE FROM public.work_orders WHERE id = p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_order_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_order(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_order(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_order(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_order(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.restore_order(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.hard_delete_order(uuid) TO authenticated;
