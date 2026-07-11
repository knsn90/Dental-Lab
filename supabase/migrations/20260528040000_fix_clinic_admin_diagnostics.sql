-- Diagnostic + fix: clinic_admin için profilde user_type='clinic_admin', role='clinic_admin'
-- olduğundan emin ol. Eski coerce davranışından kalma kayıtları + NULL user_type'leri yakala.

-- 1) auth.users metadata'sından user_type bilgisi alınabilenler için profile'ı düzelt
UPDATE public.profiles p
   SET user_type = COALESCE(NULLIF(u.raw_user_meta_data->>'user_type', ''), p.user_type),
       role      = COALESCE(p.role, u.raw_user_meta_data->>'role'),
       full_name = COALESCE(NULLIF(p.full_name, ''), u.raw_user_meta_data->>'full_name', '')
  FROM auth.users u
 WHERE u.id = p.id
   AND (
        p.user_type IS NULL
     OR p.user_type = ''
     OR (u.raw_user_meta_data->>'user_type' = 'clinic_admin' AND p.user_type = 'doctor')
   );

-- 2) role='clinic_admin' olan tüm kayıtların user_type'ı 'clinic_admin' olsun
UPDATE public.profiles
   SET user_type = 'clinic_admin'
 WHERE role = 'clinic_admin'
   AND user_type <> 'clinic_admin';

-- 3) clinic_admin'lerin is_active=true + approval_status='approved' olduğundan emin ol
--    (admin-create-user üzerinden eklenenler için)
UPDATE public.profiles
   SET is_active = TRUE
 WHERE user_type = 'clinic_admin'
   AND is_active IS NOT TRUE;

-- 4) full_name boşsa email'in @ öncesinden türet — UI'da hiçbir şey görünmesin diye
UPDATE public.profiles p
   SET full_name = split_part(u.email, '@', 1)
  FROM auth.users u
 WHERE u.id = p.id
   AND (p.full_name IS NULL OR trim(p.full_name) = '')
   AND p.user_type = 'clinic_admin';
