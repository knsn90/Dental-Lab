-- Klinik admin chat'te lab/admin kullanıcılarının profil bilgisini görebilsin
-- (sender:profiles join boş dönüyordu → mesajlarda gönderici "?" gözüküyordu).
--
-- Bu policy lab + admin kullanıcılarının minimum kimlik bilgisini (id, full_name,
-- user_type, avatar_url) clinic_admin'lere açar. RLS bütün satırı açar; UI
-- zaten sadece bu alanları select eder.

DROP POLICY IF EXISTS clinic_admin_view_lab_users ON public.profiles;
CREATE POLICY clinic_admin_view_lab_users
  ON public.profiles FOR SELECT
  USING (
    is_clinic_admin()
    AND user_type IN ('lab', 'admin')
  );
