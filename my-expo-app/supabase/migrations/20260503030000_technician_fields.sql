-- Teknisyen ek alanları: aylık maaş ve stage yetkileri
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_salary  NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_stages  TEXT[]        DEFAULT NULL;

COMMENT ON COLUMN public.profiles.monthly_salary IS 'Teknisyen aylık maaş (₺)';
COMMENT ON COLUMN public.profiles.allowed_stages IS 'Teknisyenin yapabildiği üretim aşamaları';
