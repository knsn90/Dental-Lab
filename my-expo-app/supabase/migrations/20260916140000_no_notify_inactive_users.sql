-- Pasif kullanıcıya HİÇBİR kanaldan bildirim gitmez (kullanıcı kararı 2026-09-16).
--
-- Sorun: bildirim yazan 8 fonksiyonun (_notify_inapp, _notify_dedup, _notify_channels,
-- create_notification, notify_cancel_request, notify_change_request,
-- fn_daily_order_watch, fn_stock_count_reminder) hiçbiri profiles.is_active bakmıyordu.
-- İşten ayrılmış teknisyen uygulama içi bildirim almaya ve WhatsApp mesajı görmeye
-- devam ediyordu (2026-09-16: pasif Melike Çamur'a aşama bildirimleri gitti).
--
-- Katman 1 (bu migration): notifications'a satır BİLE yazılmaz.
--   → uygulama içi bildirim oluşmaz
--   → WhatsApp fan-out'u (trg_whatsapp_meta_notify, AFTER INSERT) hiç tetiklenmez
-- Katman 2 (edge function): e-posta/push alıcıları _shared/notify-authz.ts'te,
--   WhatsApp alıcıları send-whatsapp-meta'da is_active ile süzülür — çünkü bu
--   kanallar notifications satırından BAĞIMSIZ olarak da çağrılabiliyor.
--
-- is_active NULL = AKTİF sayılır (eski kayıtlar sessizce susmasın).
CREATE OR REPLACE FUNCTION public.trg_notifications_skip_inactive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT p.is_active FROM public.profiles p WHERE p.id = NEW.user_id), true) THEN
    RETURN NULL;   -- satırı sessizce düşür: bildirim hiç oluşmaz
  END IF;
  RETURN NEW;
END;
$function$;

-- 'z' öneki: diğer BEFORE INSERT trigger'larından SONRA çalışsın (ad sırasına göre).
DROP TRIGGER IF EXISTS ztrg_notifications_skip_inactive ON public.notifications;
CREATE TRIGGER ztrg_notifications_skip_inactive
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notifications_skip_inactive();
