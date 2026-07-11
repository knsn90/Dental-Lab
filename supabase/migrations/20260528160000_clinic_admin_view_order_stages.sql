-- Klinik admin kendi kliniğindeki hekimlerin siparişlerinin order_stages'ini görsün
-- (work_orders RLS uyumlu — hem profiles hem doctors tablosundan eşleşme).
-- Mevcut order_stages_select policy sadece lab/admin + sipariş sahibi hekimi kapsıyordu.

DROP POLICY IF EXISTS clinic_admin_view_order_stages ON public.order_stages;
CREATE POLICY clinic_admin_view_order_stages
  ON public.order_stages FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
       WHERE wo.id = order_stages.work_order_id
         AND (
           EXISTS (
             SELECT 1 FROM public.profiles p
              WHERE p.id = wo.doctor_id
                AND p.clinic_id = my_clinic_id()
           )
           OR
           EXISTS (
             SELECT 1 FROM public.doctors d
              WHERE d.id = wo.doctor_id
                AND d.clinic_id = my_clinic_id()
           )
         )
    )
  );
