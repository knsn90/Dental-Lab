-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — my_clinic_users view: doctors tablosunu da dahil et
--
-- Sorun:
--   Eski hekimler doctors tablosunda (auth hesabı yok) olabilir.
--   Yeni my_clinic_users view'ı sadece profiles'a bakıyordu → liste boş.
--
-- Çözüm:
--   my_clinic_doctors view'ı gibi UNION ALL ile doctors satırlarını da getir.
--   Doctors tablosundaki satırlar için user_type='doctor', clinic_permissions={}
--   ve diğer profile-spesifik alanlar NULL döner.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.my_clinic_users AS
  -- Auth hesabı olan kullanıcılar (hekim + sekreter + yedek yönetici)
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.avatar_url,
    p.is_active,
    p.clinic_id,
    c.name AS clinic_name,
    p.user_type,
    p.specialty,
    COALESCE(p.clinic_permissions, '{}'::jsonb) AS clinic_permissions,
    p.created_at,
    'profile'::text AS source
    FROM public.profiles p
    LEFT JOIN public.clinics c ON c.id = p.clinic_id
   WHERE p.user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
     AND p.clinic_id IS NOT NULL

  UNION ALL

  -- Sadece doctors tablosunda olan (auth hesabı yok) hekimler
  SELECT
    d.id,
    d.full_name,
    d.phone,
    NULL::text AS email,
    NULL::text AS avatar_url,
    d.is_active,
    d.clinic_id,
    c.name AS clinic_name,
    'doctor'::text AS user_type,
    NULL::text AS specialty,
    '{}'::jsonb AS clinic_permissions,
    d.created_at,
    'doctors'::text AS source
    FROM public.doctors d
    LEFT JOIN public.clinics c ON c.id = d.clinic_id
   WHERE d.clinic_id IS NOT NULL
     -- Aynı kişi hem profiles hem doctors'ta varsa profile satırı önceliklidir
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p2
        WHERE p2.user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
          AND lower(trim(p2.full_name)) = lower(trim(d.full_name))
          AND p2.clinic_id = d.clinic_id
     );

GRANT SELECT ON public.my_clinic_users TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
