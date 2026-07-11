-- GÜVENLİK + DOĞRULUK: my_clinic_users view'i çapraz-klinik veri sızdırıyordu.
-- Canlı view, klinik kullanıcılarını (profiles) ve klinik hekimlerini (doctors)
-- UNION ediyordu ANCAK clinic_id'ye göre scope etmiyordu → başka kliniğin hekimi
-- (ör. doctors tablosundaki Beyza) yanlış klinikte görünüyordu.
--
-- Çözüm: her iki kaynağı da oturum sahibinin kliniğine sınırla.
-- auth.uid() JWT'den çözülür (view sahibinden bağımsız), bu yüzden güvenli + kesin.
--
-- NOT: ClinicUsersScreen yalnızca bu view'i okur. "Hekim" kayıtları portal hesabı
-- olmayan doctors tablosundan gelir; bu yüzden UNION şart (yoksa hekimler kaybolur).

DROP VIEW IF EXISTS public.my_clinic_users;

CREATE VIEW public.my_clinic_users AS
  -- Klinik portal kullanıcıları (profiles): yönetici / sekreter / hesabı olan hekim
  SELECT
    p.id, p.full_name, p.phone, p.email, p.avatar_url, p.is_active,
    p.clinic_id, p.clinic_name, p.user_type, p.specialty, p.clinic_permissions,
    p.created_at
  FROM public.profiles p
  WHERE p.user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
    AND p.clinic_id IS NOT NULL
    AND p.clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
  UNION ALL
  -- Klinik hekimleri (lab tarafından yönetilen doctors tablosu, portal hesabı yok)
  SELECT
    d.id, d.full_name, d.phone,
    NULL::text     AS email,
    NULL::text     AS avatar_url,
    d.is_active,
    d.clinic_id,
    c.name         AS clinic_name,
    'doctor'::text AS user_type,
    d.specialty,
    NULL::jsonb    AS clinic_permissions,
    d.created_at
  FROM public.doctors d
  LEFT JOIN public.clinics c ON c.id = d.clinic_id
  WHERE d.clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid());

GRANT SELECT ON public.my_clinic_users TO authenticated;
