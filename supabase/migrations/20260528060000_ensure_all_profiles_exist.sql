-- ROOT CAUSE: profiles.role CHECK constraint 'clinic_admin' değerini reddediyordu.
-- handle_new_user trigger ve admin-create-user edge fn sessizce başarısız oluyordu.
-- Bu yüzden 'denthekim@nexadent.net' gibi yeni clinic_admin kullanıcıları için
-- auth.users satırı oluşuyor ama profiles satırı oluşmuyordu.

-- 1) Eski role CHECK constraint'i düşür (varsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_role_check'
       AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

-- 2) Yeni permissive CHECK — clinic_admin + tüm lab role'leri + NULL kabul edilir
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role IS NULL OR role IN (
      'technician','manager','accounting','receptionist','service','intern',
      'courier','admin','clinic_admin','sef_teknisyen'
    )
  );

-- 3) Backfill: profili olmayan auth.users için profile oluştur
INSERT INTO public.profiles (
  id, user_type, role, full_name, clinic_name, phone,
  is_active, approval_status
)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'user_type', ''), 'doctor') AS user_type,
  NULLIF(u.raw_user_meta_data->>'role', '') AS role,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)) AS full_name,
  u.raw_user_meta_data->>'clinic_name' AS clinic_name,
  u.raw_user_meta_data->>'phone' AS phone,
  TRUE AS is_active,
  'approved' AS approval_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4) Mevcut profilelerdeki boş user_type'leri auth metadata'sından doldur
UPDATE public.profiles p
   SET user_type = COALESCE(NULLIF(u.raw_user_meta_data->>'user_type', ''), 'doctor'),
       role      = COALESCE(p.role, NULLIF(u.raw_user_meta_data->>'role', '')),
       full_name = COALESCE(NULLIF(p.full_name, ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))
  FROM auth.users u
 WHERE u.id = p.id
   AND (p.user_type IS NULL OR p.user_type = '');

-- 5) role='clinic_admin' olanların user_type'ı 'clinic_admin' olsun
UPDATE public.profiles
   SET user_type = 'clinic_admin'
 WHERE role = 'clinic_admin'
   AND user_type <> 'clinic_admin';
