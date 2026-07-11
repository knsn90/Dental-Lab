-- provider_credentials.type enum'ına yeni kategoriler ekle:
--   • ocr        — Claude Vision / OpenAI / Google Vision (fatura, dekont, iş emri OCR)
--   • messaging  — WhatsApp Business / Twilio / Telegram bot (kağıt sipariş inbox webhook)
--   • sms        — Netgsm, İletimerkezi, Twilio SMS (sipariş bildirimi, hatırlatma)
--   • maps       — Google Maps / Mapbox (kurye rotası, klinik konumu)
--   • storage    — opsiyonel ek storage (S3, R2)

ALTER TABLE public.provider_credentials
  DROP CONSTRAINT IF EXISTS provider_credentials_type_check;

ALTER TABLE public.provider_credentials
  ADD CONSTRAINT provider_credentials_type_check
  CHECK (type IN ('efatura', 'payment', 'ocr', 'messaging', 'sms', 'maps', 'storage'));
