-- ════════════════════════════════════════════════════════════════════════════
-- 20260729120000 — WhatsApp Meta bildirimine 'payment' kategorisi + gövde/lab_id
--
-- trg_whatsapp_meta_notify artık 'payment' (ödeme hatırlatması) kategorisinde de
-- send-whatsapp-meta'yı tetikler. Ödeme bildirimi work_order'a bağlı olmadığından
-- (resource_type = invoice / clinic_balance), edge fn'in lab'ı çözebilmesi için
-- NEW.lab_id ve şablon metni için NEW.body payload'a __lab_id / __body olarak katılır.
--
-- Edge fn tarafı: payment → 'odeme_hatirlatma' şablonu ({{detay}} = __body);
-- müşteri tipleri clinic_admin/clinic_secretary de dahil edildi. Şablon metninde
-- "Bu otomatik bir hatırlatmadır…" notu sabit (rahatsız etmesin).
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
  IF NEW.category NOT IN ('new_order','delivery','approval','payment') THEN
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
                          || jsonb_build_object('__body', COALESCE(NEW.body, ''), '__lab_id', COALESCE(NEW.lab_id::text, ''))
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
