-- WhatsApp ödeme hatırlatmalarında zaten canlıydı; e-posta eklerken onu koru.
ALTER TABLE public.lab_settings
  ALTER COLUMN payment_reminder_channels SET DEFAULT '{in_app,email,whatsapp}';

UPDATE public.lab_settings
   SET payment_reminder_channels = '{in_app,email,whatsapp}'
 WHERE payment_reminder_channels = '{in_app,email}';
