-- set_user_permission da self-healing olsun: kullanıcı-bazlı override yazmadan önce
-- permission anahtarı 'permissions'da yoksa otomatik ekle (FK ihlali olmasın).
CREATE OR REPLACE FUNCTION public.set_user_permission(
  p_user_id uuid, p_permission_key text, p_granted boolean, p_note text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
