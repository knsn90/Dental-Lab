-- Geri alma: 20261103130000_puan_istegi_cevap
-- Canlı önceki durum: rollbacks/20261103130000_puan_istegi_cevap.before.txt
-- Yeni fonksiyonlar düşer; trg_whatsapp_meta_notify canlı tanımına (review_problem'siz) döner.
-- Bu göçün yazdığı order_reviews (source='whatsapp') ve review_requests cevapları SİLİNMEZ;
-- onlar 20261103110000 geri alınırsa gider.

DROP FUNCTION IF EXISTS public.review_wa_record_answer(uuid, integer, text, uuid);
DROP FUNCTION IF EXISTS public.review_wa_add_note(text, uuid, text);
DROP FUNCTION IF EXISTS public._review_alert_lab(uuid, text);
DROP FUNCTION IF EXISTS public.set_review_wa_settings(boolean, integer);
DROP FUNCTION IF EXISTS public.get_review_wa_settings();

CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret text; v_anon text; v_wa_ok boolean;
BEGIN
  IF NEW.category NOT IN ('new_order','delivery','approval','payment','account') THEN RETURN NEW; END IF;
  -- Aşama/istasyon bildirimi → WhatsApp yok (uygulama içi + e-posta yeterli).
  IF NEW.payload ? 'stage_id' THEN RETURN NEW; END IF;
  IF NEW.category = 'payment' AND (NEW.payload ? 'reminder_id') THEN
    SELECT (payment_reminder_channels @> ARRAY['whatsapp']) INTO v_wa_ok FROM lab_settings WHERE lab_id = NEW.lab_id LIMIT 1;
    IF NOT COALESCE(v_wa_ok, false) THEN RETURN NEW; END IF;
  END IF;
  SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1;
  BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
  BEGIN
    PERFORM net.http_post(
      url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
      body := jsonb_build_object('userIds', jsonb_build_array(NEW.user_id::text),'category', NEW.category,
        'resource_type', COALESCE(NEW.resource_type,''),'resource_id', COALESCE(NEW.resource_id::text,''),
        'payload', COALESCE(NEW.payload,'{}'::jsonb) || jsonb_build_object('__body', COALESCE(NEW.body,''), '__lab_id', COALESCE(NEW.lab_id::text,''))));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;
