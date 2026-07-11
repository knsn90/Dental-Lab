-- Force fix: auth.users metadata'sında user_type='clinic_admin' olan herkesi düzelt
-- (önceki migration sadece belirli case'leri kapsıyordu)

-- DIAGNOSTIC: mevcut durumu NOTICE olarak yazdır
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.email,
           u.raw_user_meta_data->>'user_type' AS meta_user_type,
           u.raw_user_meta_data->>'role'      AS meta_role,
           u.raw_user_meta_data->>'full_name' AS meta_full_name,
           p.user_type AS profile_user_type,
           p.role      AS profile_role,
           p.full_name AS profile_full_name,
           p.clinic_id AS profile_clinic_id
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
     WHERE u.raw_user_meta_data->>'user_type' = 'clinic_admin'
        OR u.raw_user_meta_data->>'role' = 'clinic_admin'
        OR p.role = 'clinic_admin'
        OR p.user_type = 'clinic_admin'
  LOOP
    RAISE NOTICE 'CLINIC_ADMIN_DIAG email=% meta_ut=% meta_role=% prof_ut=% prof_role=% prof_name=%',
      r.email, r.meta_user_type, r.meta_role, r.profile_user_type, r.profile_role, r.profile_full_name;
  END LOOP;
END $$;

-- FORCE FIX: auth.users metadata'sından her klinik admin kullanıcı için profile'ı yeniden senkronize et
UPDATE public.profiles p
   SET user_type = 'clinic_admin',
       role      = 'clinic_admin',
       full_name = COALESCE(NULLIF(p.full_name, ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       clinic_name = COALESCE(p.clinic_name, u.raw_user_meta_data->>'clinic_name'),
       is_active = TRUE,
       approval_status = 'approved'
  FROM auth.users u
 WHERE u.id = p.id
   AND (
        u.raw_user_meta_data->>'user_type' = 'clinic_admin'
     OR u.raw_user_meta_data->>'role' = 'clinic_admin'
   );

-- INSERT: auth.users'da clinic_admin olarak işaretli ama profile'ı hiç olmayanları oluştur
INSERT INTO public.profiles (id, user_type, role, full_name, clinic_name, phone, is_active, approval_status)
SELECT u.id,
       'clinic_admin',
       'clinic_admin',
       COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.raw_user_meta_data->>'clinic_name',
       u.raw_user_meta_data->>'phone',
       TRUE,
       'approved'
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
   AND (
        u.raw_user_meta_data->>'user_type' = 'clinic_admin'
     OR u.raw_user_meta_data->>'role' = 'clinic_admin'
   )
ON CONFLICT (id) DO NOTHING;
