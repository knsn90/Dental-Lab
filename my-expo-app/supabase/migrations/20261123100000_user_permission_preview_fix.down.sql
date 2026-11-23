-- Geri alma: 20261123100000_user_permission_preview_fix (canlıdaki eski tanımlar)

CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(p_user_id uuid)
 RETURNS TABLE(permission_key text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
  v_user_type TEXT;
  v_role_db TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role_db FROM public.profiles WHERE id = p_user_id;
  IF v_user_type IS NULL THEN RETURN; END IF;

  IF v_user_type = 'admin' THEN
    RETURN QUERY SELECT key, 'admin'::TEXT FROM public.permissions;
    RETURN;
  ELSIF v_user_type = 'doctor'       THEN v_role := 'doctor';
  ELSIF v_user_type = 'clinic_admin' THEN v_role := 'clinic_admin';
  ELSIF v_user_type = 'lab' AND v_role_db = 'manager'    THEN v_role := 'lab_manager';
  ELSIF v_user_type = 'lab' AND v_role_db = 'technician' THEN v_role := 'technician';
  ELSIF v_user_type = 'lab' AND v_role_db = 'courier'    THEN v_role := 'courier';
  ELSE v_role := 'technician';
  END IF;

  RETURN QUERY
    SELECT rp.permission_key, 'role'::TEXT
    FROM public.role_permissions rp
    WHERE rp.role_key = v_role
      AND NOT EXISTS (
        SELECT 1 FROM public.user_permissions up
        WHERE up.user_id = p_user_id AND up.permission_key = rp.permission_key AND up.granted = FALSE
      )
    UNION
    SELECT up.permission_key, 'override_grant'::TEXT
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id AND up.granted = TRUE;
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
  DELETE FROM public.user_permissions WHERE user_id = p_user_id AND permission_key = p_permission_key;
END $function$;

DROP FUNCTION IF EXISTS public._perm_target_allowed(uuid);
