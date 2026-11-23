-- Kullanıcı bazlı yetki istisnası: hedef kapsamı sıkılaştırma.
--
-- Önceki kural (20261123100000): hedef çağıranın lab'ında VEYA lab_id'si NULL
-- olmalı. lab_id NULL = tüm klinik/hekim hesapları → bir lab admini BAŞKA
-- lab'ların müşterisi olan klinik/hekim hesaplarına da istisna yazabiliyordu.
--
-- Yeni kural: hedef
--   a) çağıranın lab personeli (profiles.lab_id = lab), ya da
--   b) çağıranın lab'ına bağlı bir klinik/hekim hesabı:
--      - kliniği bu lab'ın kliniği (clinics.lab_id), ya da
--      - aktif üyeliği var (clinic_lab_memberships: kişi veya kliniği), ya da
--      - hekim kaydı bu lab'ın (doctors.lab_id).
-- Hiçbir lab'a bağlı olmayan hesaplara artık istisna yazılamaz.
-- Mevcut 5 user_permissions satırı çağıranın lab personeline ait → etkilenmez.
-- get/set/clear fonksiyonları _perm_target_allowed'ı çağırdığı için
-- yalnız bu fonksiyon değişir; ekran listesi için list_permission_targets eklenir.

CREATE OR REPLACE FUNCTION public._perm_target_allowed(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT public.get_my_lab_id() AS lab)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles t, me
     WHERE t.id = p_user_id
       AND me.lab IS NOT NULL
       AND (
         t.lab_id = me.lab
         OR (t.lab_id IS NULL AND (
              EXISTS (SELECT 1 FROM public.clinics c
                       WHERE c.id = t.clinic_id AND c.lab_id = me.lab)
           OR EXISTS (SELECT 1 FROM public.clinic_lab_memberships m
                       WHERE m.lab_id = me.lab AND m.status = 'active'
                         AND (m.member_profile_id = t.id
                              OR (t.clinic_id IS NOT NULL AND m.member_clinic_id = t.clinic_id)))
           OR EXISTS (SELECT 1 FROM public.doctors d
                       WHERE d.id = t.doctor_id AND d.lab_id = me.lab)
         ))
       )
  );
$function$;
REVOKE ALL ON FUNCTION public._perm_target_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._perm_target_allowed(uuid) TO authenticated;

-- Yetkiler › Kullanıcı Bazlı listesi: sunucuyla aynı kapsam (yalnız admin).
CREATE OR REPLACE FUNCTION public.list_permission_targets()
 RETURNS TABLE(id uuid, full_name text, email text, user_type text, role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name::text, p.email::text, p.user_type::text, p.role::text
      FROM public.profiles p
     WHERE p.user_type <> 'admin'
       AND coalesce(p.is_active, true)
       AND public._perm_target_allowed(p.id)
     ORDER BY p.full_name
     LIMIT 1000;
END $function$;
REVOKE ALL ON FUNCTION public.list_permission_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_permission_targets() TO authenticated;
