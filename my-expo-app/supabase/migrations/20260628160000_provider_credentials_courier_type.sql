-- ============================================================
-- 20260628160000 — provider_credentials.type'a 'courier' ekle
--
-- Kurye entegrasyonları (BanaBiKurye vb.) lab-bazlı saklanır: her lab kendi
-- üyeliğinin token'ını provider_credentials(type='courier', provider='banabikurye',
-- credentials={auth_token, environment}) olarak girer. RLS + tek-aktif trigger'ı
-- mevcut kalıptan otomatik gelir. Sadece CHECK kısıtını genişletiyoruz (idempotent).
-- ============================================================
ALTER TABLE public.provider_credentials
  DROP CONSTRAINT IF EXISTS provider_credentials_type_check;

ALTER TABLE public.provider_credentials
  ADD CONSTRAINT provider_credentials_type_check
  CHECK (type IN ('efatura','payment','ocr','messaging','sms','maps','storage','courier'));
