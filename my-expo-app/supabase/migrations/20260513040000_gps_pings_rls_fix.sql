-- gps_pings RLS — courier_id direkt profiles(id) referansı olduğu için
-- eski "couriers" join'li policy'leri yenile.

DROP POLICY IF EXISTS gps_pings_insert ON public.gps_pings;
CREATE POLICY gps_pings_insert ON public.gps_pings
  FOR INSERT
  WITH CHECK (
    delivery_id IN (
      SELECT id FROM public.deliveries
      WHERE courier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gps_pings_select ON public.gps_pings;
CREATE POLICY gps_pings_select ON public.gps_pings
  FOR SELECT
  USING (
    -- lab + admin tüm pings'i okur
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE user_type IN ('lab','admin')
    )
    -- hekim kendi siparişinin pings'ini okur
    OR auth.uid() = (
      SELECT wo.doctor_id FROM public.deliveries d
      JOIN public.work_orders wo ON wo.id = d.work_order_id
      WHERE d.id = gps_pings.delivery_id
    )
    -- kurye kendi delivery'sinin pings'ini okur
    OR auth.uid() = (
      SELECT courier_id FROM public.deliveries WHERE id = gps_pings.delivery_id
    )
  );

-- Realtime gps_pings ekli mi kontrol — değilse ekle
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_pings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
