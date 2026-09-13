-- Ödeme hatırlatma politikası — lab geneli tek ayar (lab_settings'e additive).
-- Otomatik (cron) + manuel gönderim; kanallar (in_app her zaman) + ton + sıklık.
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS payment_reminder_auto            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_reminder_frequency_days  integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS payment_reminder_channels        text[]  NOT NULL DEFAULT '{in_app,email}',
  ADD COLUMN IF NOT EXISTS payment_reminder_tone            text    NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS payment_reminder_min_days_overdue integer NOT NULL DEFAULT 1;

-- Değer güvenliği
ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_reminder_tone_chk,
  ADD  CONSTRAINT lab_settings_reminder_tone_chk
       CHECK (payment_reminder_tone IN ('gentle','standard','firm'));

ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_reminder_freq_chk,
  ADD  CONSTRAINT lab_settings_reminder_freq_chk
       CHECK (payment_reminder_frequency_days BETWEEN 1 AND 90);
