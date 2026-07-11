-- Klinik admin kendi kliniğinin hekimlerini oluşturup düzenleyebilsin.
--
-- 1) lab_id otomatik klinikten türetilsin (clinic_admin'in lab_id'si yoktur,
--    auto_set_lab_id NULL döner ve NOT NULL constraint patlar)
-- 2) RLS: clinic_admin → INSERT/UPDATE/DELETE own clinic doctors

BEGIN;

-- 1) doctors için özel trigger — clinic_id verilmişse oradan lab_id türet
CREATE OR REPLACE FUNCTION public._doctors_set_lab_id_from_clinic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab_id UUID;
BEGIN
  IF NEW.lab_id IS NULL THEN
    -- Önce clinic_id'den çek
    IF NEW.clinic_id IS NOT NULL THEN
      SELECT lab_id INTO v_lab_id FROM public.clinics WHERE id = NEW.clinic_id;
      IF v_lab_id IS NOT NULL THEN
        NEW.lab_id := v_lab_id;
        RETURN NEW;
      END IF;
    END IF;
    -- Yoksa caller profilinden (eski auto_set_lab_id davranışı — lab/admin için)
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = auth.uid();
    IF v_lab_id IS NOT NULL THEN
      NEW.lab_id := v_lab_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS doctors_auto_lab_id ON public.doctors;
CREATE TRIGGER doctors_auto_lab_id
  BEFORE INSERT ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public._doctors_set_lab_id_from_clinic();

-- 2) RLS — clinic_admin kendi kliniğindeki hekimleri tam yönetebilir
DROP POLICY IF EXISTS clinic_admin_insert_clinic_doctors ON public.doctors;
CREATE POLICY clinic_admin_insert_clinic_doctors
  ON public.doctors FOR INSERT
  WITH CHECK (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND clinic_id = my_clinic_id()
  );

DROP POLICY IF EXISTS clinic_admin_update_clinic_doctors ON public.doctors;
CREATE POLICY clinic_admin_update_clinic_doctors
  ON public.doctors FOR UPDATE
  USING (
    is_clinic_admin() AND clinic_id = my_clinic_id()
  )
  WITH CHECK (
    is_clinic_admin() AND clinic_id = my_clinic_id()
  );

DROP POLICY IF EXISTS clinic_admin_delete_clinic_doctors ON public.doctors;
CREATE POLICY clinic_admin_delete_clinic_doctors
  ON public.doctors FOR DELETE
  USING (
    is_clinic_admin() AND clinic_id = my_clinic_id()
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
