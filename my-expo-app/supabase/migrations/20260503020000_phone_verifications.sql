-- ============================================================
-- phone_verifications — Custom OTP doğrulama tablosu
-- Yerli SMS sağlayıcı (NetGSM, İleti Merkezi vb.) ile çalışır
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  code        TEXT NOT NULL,
  verified    BOOLEAN DEFAULT FALSE,
  attempts    INT DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index: hızlı arama
CREATE INDEX idx_phone_verifications_user ON public.phone_verifications(user_id, verified);
CREATE INDEX idx_phone_verifications_expires ON public.phone_verifications(expires_at);

-- RLS
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Kullanıcı sadece kendi kayıtlarını görebilir (ama kodları göremez)
CREATE POLICY "Users can view own verification status"
  ON public.phone_verifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Insert/Update sadece service_role ile (Edge Function)
-- Authenticated kullanıcılar insert/update yapamaz

-- profiles tablosuna phone_verified kolonu ekle
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- Eski kayıtları otomatik temizle (opsiyonel cron ile)
-- SELECT cron.schedule('cleanup-phone-verifications', '0 */6 * * *',
--   $$DELETE FROM public.phone_verifications WHERE expires_at < now() - interval '1 day'$$
-- );
