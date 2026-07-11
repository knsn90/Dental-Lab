-- Klinik admin için work_order_photos SELECT policy'si — eksik olduğu için
-- klinik panelinde sipariş dosyaları boş görünüyordu.
--
-- Mantık: clinic_admin, kendi kliniğindeki hekimlerin (profiles VEYA doctors tablosu)
-- siparişlerindeki dosyaları görür.

DROP POLICY IF EXISTS clinic_admin_view_clinic_photos ON public.work_order_photos;
CREATE POLICY clinic_admin_view_clinic_photos
  ON public.work_order_photos FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
       WHERE wo.id = work_order_photos.work_order_id
         AND (
           EXISTS (
             SELECT 1 FROM public.profiles p_doc
              WHERE p_doc.id = wo.doctor_id
                AND p_doc.clinic_id = my_clinic_id()
           )
           OR
           EXISTS (
             SELECT 1 FROM public.doctors d_doc
              WHERE d_doc.id = wo.doctor_id
                AND d_doc.clinic_id = my_clinic_id()
           )
         )
    )
  );

-- INSERT (klinik admin sipariş dosyası yükleyebilsin)
DROP POLICY IF EXISTS clinic_admin_insert_clinic_photos ON public.work_order_photos;
CREATE POLICY clinic_admin_insert_clinic_photos
  ON public.work_order_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
       WHERE wo.id = work_order_id
         AND (
           EXISTS (
             SELECT 1 FROM public.profiles p_doc
              WHERE p_doc.id = wo.doctor_id
                AND p_doc.clinic_id = my_clinic_id()
           )
           OR
           EXISTS (
             SELECT 1 FROM public.doctors d_doc
              WHERE d_doc.id = wo.doctor_id
                AND d_doc.clinic_id = my_clinic_id()
           )
         )
    )
  );
