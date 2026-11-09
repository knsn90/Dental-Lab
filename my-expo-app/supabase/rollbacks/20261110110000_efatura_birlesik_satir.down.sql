-- 20261110110000_efatura_birlesik_satir — DOWN. Yeni get_invoice_work_breakdown(uuid) fonksiyonunu ve
-- lab_settings.efatura_line_mode sütununu (CHECK kısıtıyla birlikte) kaldırır. Başka tanıma dokunmaz;
-- migration öncesinde ikisi de canlıda YOKTU (bkz. before.txt). Sütunun değerleri (lab'ların seçtiği satır biçimi)
-- kaybolur → down sonrası tüm lab'lar bugünkü 'kalem' davranışına döner.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP FUNCTION public.get_invoice_work_breakdown(uuid);
ALTER TABLE public.lab_settings DROP COLUMN efatura_line_mode;

COMMIT;
