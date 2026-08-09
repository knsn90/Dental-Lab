-- Dış kurye gönderilerinin GERÇEK alım/teslim koordinatlarını saklamak için.
-- Şimdiye dek harita alım noktasını lab-default pickup'tan, teslimi metin
-- adresten kaba geokodla tahmin ediyordu → panelden (özel adreslerle) açılan
-- BanaBiKurye gönderilerinde 1/2 noktaları yanlış çıkıyordu. Additive: eski
-- kayıtlar NULL kalır, ekran NULL'da bugünkü davranışa (labCoord + geocode) düşer.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS origin_lat     numeric,
  ADD COLUMN IF NOT EXISTS origin_lng     numeric,
  ADD COLUMN IF NOT EXISTS dest_lat       numeric,
  ADD COLUMN IF NOT EXISTS dest_lng       numeric,
  ADD COLUMN IF NOT EXISTS origin_name    text,
  ADD COLUMN IF NOT EXISTS origin_address text;

COMMENT ON COLUMN public.deliveries.origin_lat  IS 'Alım noktası enlem (dış sağlayıcı gönderisinde gerçek koordinat; NULL ise lab-default/geocode)';
COMMENT ON COLUMN public.deliveries.dest_lat     IS 'Teslim noktası enlem (dış sağlayıcı gönderisinde gerçek koordinat; NULL ise geocode)';
COMMENT ON COLUMN public.deliveries.origin_name  IS 'Alım noktası etiketi (gönderen) — sipariş kliniğinden bağımsız (ör. tedarikçi adresi)';
