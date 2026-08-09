-- ════════════════════════════════════════════════════════════════════════════
-- 20260726160000 — Müşteriye Meta WhatsApp bildirimi (new_order/delivery/approval)
--
-- notifications tablosuna satır DÜŞÜNCE (client dispatch VEYA server trigger fark
-- etmez), yalnız bu 3 kategoride send-whatsapp-meta edge fn'ine net.http_post atar.
-- Edge fn: müşteri (klinik/hekim) + whatsapp_phone + opt-out kontrolünü ve
-- şablon/lab-token seçimini kendisi yapar (lab/admin alıcıya gitmez).
--
-- Tek entegrasyon noktası → _notify_channels / _notify_inapp / dispatch.ts
-- DEĞİŞMEZ. Twilio yolu (send-whatsapp-notification) dokunulmadı (secret yoksa
-- zaten no-op); çift gönderim yok çünkü Meta bu fn'e özeldir.
--
-- GÜVENLİK: tüm iş EXCEPTION bloğunda → bildirim hatası insert'i ASLA bozmaz.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
BEGIN
  -- Yalnız müşteriye giden 3 kategori
  IF NEW.category NOT IN ('new_order','delivery','approval') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon,
        'x-notify-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object(
        'userIds',       jsonb_build_array(NEW.user_id::text),
        'category',      NEW.category,
        'resource_type', COALESCE(NEW.resource_type, ''),
        'resource_id',   COALESCE(NEW.resource_id::text, ''),
        'payload',       COALESCE(NEW.payload, '{}'::jsonb)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Bildirim hatası insert'i bozmasın
    NULL;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_whatsapp_meta_notify ON public.notifications;
CREATE TRIGGER trg_whatsapp_meta_notify
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_whatsapp_meta_notify();

-- whatsapp_notifications.provider'a 'meta' değeri için ek kısıt yok (text).
