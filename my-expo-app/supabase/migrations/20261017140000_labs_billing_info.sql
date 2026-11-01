-- Lab fatura (künye) bilgileri — entegratörden bağımsız, lab'a ait.
-- e-fatura (efatura-luca ve ileride diğerleri), ekstre ve iş kâğıdı buradan okur.
-- VKN/TCKN mevcut labs.tax_number'da kalır; labs.address artık bu alanlardan
-- oluşturulan GÖRÜNEN adrestir ("…, İlçe / İl" — modules/settings/labBilling.ts).
-- Yalnız ekleme: mevcut satırlar NULL, RLS/politika/yetki değişmez.
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS legal_name  text,
  ADD COLUMN IF NOT EXISTS tax_office  text,
  ADD COLUMN IF NOT EXISTS street      text,
  ADD COLUMN IF NOT EXISTS district    text,
  ADD COLUMN IF NOT EXISTS city        text,
  ADD COLUMN IF NOT EXISTS postal_code text;

COMMENT ON COLUMN public.labs.legal_name  IS 'Ticari unvan (fatura künyesi). Ayarlar → Genel → Fatura Bilgileri; zorunlu.';
COMMENT ON COLUMN public.labs.tax_office  IS 'Vergi dairesi (fatura künyesi); zorunlu.';
COMMENT ON COLUMN public.labs.street      IS 'Açık adres (mahalle, cadde, no); labs.address bundan + ilçe/il oluşur.';
COMMENT ON COLUMN public.labs.district    IS 'İlçe; zorunlu.';
COMMENT ON COLUMN public.labs.city        IS 'İl; zorunlu.';
COMMENT ON COLUMN public.labs.postal_code IS 'Posta kodu (isteğe bağlı, 5 hane).';
