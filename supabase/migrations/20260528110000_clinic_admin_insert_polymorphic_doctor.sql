-- Klinik admin yeni sipariş açarken RLS hatası alıyor:
--   "new row violates row-level security policy for table work_orders"
--
-- Sebep:
--   clinic_admin_insert_clinic_orders policy'si sadece profiles.doctor_id'yi
--   tanıyordu. Ancak work_orders.doctor_id polymorphic (profiles.id veya doctors.id).
--   Klinik admin formundan seçilen hekim doctors tablosundan gelirse INSERT reddediliyordu.
--
-- Çözüm:
--   INSERT ve UPDATE policy'lerine doctors-table EXISTS alternatifini ekle
--   (SELECT policy'sinde 20260528080000 ile zaten yapılmıştı).

BEGIN;

-- INSERT
DROP POLICY IF EXISTS clinic_admin_insert_clinic_orders ON public.work_orders;
CREATE POLICY clinic_admin_insert_clinic_orders
  ON public.work_orders FOR INSERT
  WITH CHECK (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p_doc
         WHERE p_doc.id = work_orders.doctor_id
           AND p_doc.clinic_id = my_clinic_id()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.doctors d_doc
         WHERE d_doc.id = work_orders.doctor_id
           AND d_doc.clinic_id = my_clinic_id()
      )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS clinic_admin_update_clinic_orders ON public.work_orders;
CREATE POLICY clinic_admin_update_clinic_orders
  ON public.work_orders FOR UPDATE
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p_doc
         WHERE p_doc.id = work_orders.doctor_id
           AND p_doc.clinic_id = my_clinic_id()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.doctors d_doc
         WHERE d_doc.id = work_orders.doctor_id
           AND d_doc.clinic_id = my_clinic_id()
      )
    )
  );

COMMIT;
