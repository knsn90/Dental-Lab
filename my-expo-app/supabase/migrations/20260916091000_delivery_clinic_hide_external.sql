-- Dış servis bacakları KLİNİĞE GÖRÜNMEZ.
--
-- deliveries_select_clinic yalnız siparişe bakıyordu; sipariş kliniğe aitse
-- o siparişin TÜM kurye hareketleri kliniğe görünüyordu. Labın kendi tedarik
-- hareketi (milling merkezi vb.) müşteriyi ilgilendirmez ve fiyat/tedarikçi
-- bilgisi sızdırır. Yön filtresi eklendi; lab/admin görünürlüğü değişmedi.
-- Hekim rolünün zaten teslimat okuma yetkisi yok.

DROP POLICY IF EXISTS deliveries_select_clinic ON public.deliveries;
CREATE POLICY deliveries_select_clinic ON public.deliveries
  FOR SELECT USING (
    (my_user_type() = ANY (ARRAY['clinic_admin'::text, 'clinic_secretary'::text]))
    AND (my_clinic_id() IS NOT NULL)
    AND COALESCE(direction, 'lab_to_clinic') IN ('lab_to_clinic', 'clinic_to_lab')
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
       WHERE wo.id = deliveries.work_order_id
         AND (EXISTS (SELECT 1 FROM public.profiles pd
                       WHERE pd.id = wo.doctor_id AND pd.clinic_id = my_clinic_id())
           OR EXISTS (SELECT 1 FROM public.doctors dd
                       WHERE dd.id = wo.doctor_id AND dd.clinic_id = my_clinic_id()))));
