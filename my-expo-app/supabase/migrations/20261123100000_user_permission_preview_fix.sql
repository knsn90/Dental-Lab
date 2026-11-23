-- Yetkiler › Kullanıcı Bazlı düzeltmeleri.
--
-- Sorunlar:
--   1) get_user_effective_permissions rolü my_role_key()'den FARKLI eşliyordu:
--      lab'da manager/technician/courier dışındaki roller (muhasebe, servis,
--      resepsiyon, stajyer…) → 'technician'. Oysa kişinin gerçek yetkisi
--      (get_my_permissions → my_role_key) bunları 'lab_manager' sayar.
--   2) Aynı fonksiyon role_permissions'ı lab süzgeci OLMADAN okuyordu: lab'ın
--      özelleştirdiği rol yetkileri yerine global + tüm lab satırları karışıyordu.
--      Artık resolve_role_permissions(rol, lab) kullanılır — gerçek hesapla aynı.
--   3) Kullanıcı istisnası fonksiyonları (get_user_overrides / set_user_permission /
--      clear_user_permission / get_user_effective_permissions) yalnız "çağıran
--      admin mi?" diye bakıyordu; başka bir lab'ın personeline de istisna
--      yazılabiliyordu. Artık hedef kişi çağıranın lab'ında olmalı (lab_id eşit)
--      ya da lab'a bağlı olmayan klinik/hekim hesabı olmalı (lab_id NULL).
--
-- Mevcut 5 user_permissions satırının hepsi çağıranla aynı lab'da → etkilenmez.

CREATE OR REPLACE FUNCTION public._perm_target_allowed(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles t
     WHERE t.id = p_user_id
       AND (t.lab_id IS NULL OR t.lab_id = public.get_my_lab_id())
  );
$function$;
REVOKE ALL ON FUNCTION public._perm_target_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._perm_target_allowed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(p_user_id uuid)
 RETURNS TABLE(permission_key text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type text; v_role_db text; v_lab uuid; v_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  IF NOT public._perm_target_allowed(p_user_id) THEN
    RAISE EXCEPTION 'permission denied: user not in your lab';
  END IF;

  SELECT user_type, role, lab_id INTO v_user_type, v_role_db, v_lab
    FROM public.profiles WHERE id = p_user_id;
  IF v_user_type IS NULL THEN RETURN; END IF;

  IF v_user_type = 'admin' THEN
    RETURN QUERY SELECT p.key, 'admin'::text FROM public.permissions p;
    RETURN;
  END IF;

  -- my_role_key() ile BİREBİR aynı eşleme
  v_role := CASE
    WHEN v_user_type = 'lab' AND v_role_db = 'manager'    THEN 'lab_manager'
    WHEN v_user_type = 'lab' AND v_role_db = 'technician' THEN 'technician'
    WHEN v_user_type = 'lab' AND v_role_db = 'courier'    THEN 'courier'
    WHEN v_user_type = 'lab'                              THEN 'lab_manager'
    WHEN v_user_type = 'doctor'                           THEN 'doctor'
    WHEN v_user_type = 'clinic_admin'                     THEN 'clinic_admin'
    ELSE 'technician'
  END;
  -- Klinik/hekim hesaplarının lab_id'si yok → çağıranın lab'ının ayarları
  v_lab := coalesce(v_lab, public.get_my_lab_id());

  RETURN QUERY
    SELECT k, 'role'::text
      FROM unnest(public.resolve_role_permissions(v_role, v_lab)) AS k
     WHERE NOT EXISTS (
       SELECT 1 FROM public.user_permissions up
        WHERE up.user_id = p_user_id AND up.permission_key = k AND up.granted = false)
    UNION
    SELECT up.permission_key, 'override_grant'::text
      FROM public.user_permissions up
     WHERE up.user_id = p_user_id AND up.granted = true;
END $function$;

CREATE OR REPLACE FUNCTION public.get_user_overrides(p_user_id uuid)
 RETURNS TABLE(permission_key text, granted boolean, note text, granted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  IF NOT public._perm_target_allowed(p_user_id) THEN
    RAISE EXCEPTION 'permission denied: user not in your lab';
  END IF;
  RETURN QUERY
    SELECT up.permission_key, up.granted, up.note, up.granted_at
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
    ORDER BY up.granted_at DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.set_user_permission(p_user_id uuid, p_permission_key text, p_granted boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  IF NOT public._perm_target_allowed(p_user_id) THEN
    RAISE EXCEPTION 'permission denied: user not in your lab';
  END IF;

  INSERT INTO public.permissions (key, label, category)
  VALUES (p_permission_key,
    initcap(replace(regexp_replace(p_permission_key, '^(view|manage)_', ''), '_', ' ')) ||
      CASE WHEN left(p_permission_key,7)='manage_' THEN ' (Yönetim)'
           WHEN left(p_permission_key,5)='view_'   THEN ' (Görüntüleme)' ELSE '' END,
    CASE WHEN left(p_permission_key,5)='view_' THEN 'page' ELSE 'action' END)
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO public.user_permissions (user_id, permission_key, granted, granted_by, note)
  VALUES (p_user_id, p_permission_key, p_granted, auth.uid(), p_note)
  ON CONFLICT (user_id, permission_key) DO UPDATE
    SET granted = EXCLUDED.granted,
        granted_by = auth.uid(),
        granted_at = NOW(),
        note = EXCLUDED.note;
END $function$;

CREATE OR REPLACE FUNCTION public.clear_user_permission(p_user_id uuid, p_permission_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  IF NOT public._perm_target_allowed(p_user_id) THEN
    RAISE EXCEPTION 'permission denied: user not in your lab';
  END IF;
  DELETE FROM public.user_permissions WHERE user_id = p_user_id AND permission_key = p_permission_key;
END $function$;
