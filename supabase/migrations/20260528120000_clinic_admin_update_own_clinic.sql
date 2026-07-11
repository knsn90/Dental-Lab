-- Klinik admin kendi kliniğinin bilgilerini güncelleyebilsin
-- (Ayarlar → Profil → Kurum Bilgileri tabından inline edit)

DROP POLICY IF EXISTS clinic_admin_view_own_clinic ON public.clinics;
CREATE POLICY clinic_admin_view_own_clinic
  ON public.clinics FOR SELECT
  USING (is_clinic_admin() AND id = my_clinic_id());

DROP POLICY IF EXISTS clinic_admin_update_own_clinic ON public.clinics;
CREATE POLICY clinic_admin_update_own_clinic
  ON public.clinics FOR UPDATE
  USING (is_clinic_admin() AND id = my_clinic_id())
  WITH CHECK (is_clinic_admin() AND id = my_clinic_id());
