-- Dış sağlayıcı (BanaBiKurye) kuryesinin kimliğini teslimat kaydında kalıcılaştır.
-- Neden: geçmiş (teslim edilmiş/iptal) gönderilerde kurye adı/avatarı gösterebilmek için.
-- Canlı takipte kimlik yalnız API'den geliyor ve DB'ye yazılmıyordu; gönderi
-- tamamlanınca ekranda kaybolyordu. banabikurye-dispatch { action:'track' } artık
-- API'den kurye kimliği gelince bu kolonları günceller (service role).
-- Ekleyici + nullable — mevcut satırlara ve RLS'e etkisi yok.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS ext_courier_name  TEXT,
  ADD COLUMN IF NOT EXISTS ext_courier_phone TEXT,
  ADD COLUMN IF NOT EXISTS ext_courier_photo TEXT;

COMMENT ON COLUMN public.deliveries.ext_courier_name  IS 'Dış sağlayıcı (BanaBiKurye) kuryesinin adı — track çağrısından yakalanıp kalıcılaştırılır; geçmiş gönderilerde API''siz gösterim için.';
COMMENT ON COLUMN public.deliveries.ext_courier_phone IS 'Dış kuryenin telefonu.';
COMMENT ON COLUMN public.deliveries.ext_courier_photo IS 'Dış kuryenin avatar URL''si (photo_url).';
