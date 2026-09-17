-- Aşama atama bildirimleri WhatsApp'a ÇIKMASIN (kullanıcı kararı 2026-09-16).
--
-- Sorun: trg_stage_notify_technician bir aşama teknisyene atanınca/aktifleşince
-- bildirimi 'new_order' kategorisiyle yazıyor. notifications üzerindeki WhatsApp
-- fan-out'u bu kategoriyi gördüğü için her aşama hareketinde mesaj gidiyordu.
-- Üstelik payload'da siparis_no/klinik/hasta olmadığı için 'yeni_siparis_lab'
-- şablonu tüm alanları "—" basıyor → içi boş mesaj; alıcılar arasında PASİF
-- kullanıcılar da vardı.
--
-- Çözüm: kategoriye dokunmadan (uygulama içi bildirim + e-posta tercihleri aynen
-- kalsın diye) yalnız WhatsApp kapısında aşama bildirimini ele; aşama bildirimi
-- payload'ında HER ZAMAN 'stage_id' vardır, gerçek yeni-sipariş bildiriminde yoktur.
-- Geri açmak istenirse: aşağıdaki tek IF bloğunu kaldırmak yeterli.
CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret text; v_anon text; v_wa_ok boolean;
BEGIN
  IF NEW.category NOT IN ('new_order','delivery','approval','payment') THEN RETURN NEW; END IF;
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
