-- Ödeme hatırlatması: kanal-farkında gönderim (in_app + e-posta + WhatsApp),
-- otomatik cron + manuel; hepsi lab_settings politikasına göre.
--
-- Mimari:
--   _send_payment_reminder_core()  → asıl iş (kayıt + notifications + e-posta).
--   send_payment_reminder(...)     → manuel wrapper (auth + rol + politika okur).
--   run_auto_payment_reminders()   → cron: auto=true labların gecikmiş kliniklerine.
--   trg_whatsapp_meta_notify()     → hatırlatma satırında WhatsApp'ı politikayla geçer.

-- ── Çekirdek ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._send_payment_reminder_core(
  p_lab_id     uuid,
  p_clinic_id  uuid,
  p_invoice_id uuid,
  p_tone       text,
  p_message    text,
  p_severity   text,
  p_channels   text[],
  p_sent_by    uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_name   TEXT;
  v_total_due     NUMERIC := 0;
  v_overdue_due   NUMERIC := 0;
  v_overdue_count INT     := 0;
  v_reminder_id   UUID;
  v_title         TEXT;
  v_body          TEXT;
  v_recipients    INT     := 0;
  v_user_ids      UUID[];
  v_url           TEXT;
  v_secret        TEXT;
  v_anon          TEXT;
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;

  -- Bakiye snapshot — tek fatura ya da tüm açık faturalar
  IF p_invoice_id IS NOT NULL THEN
    SELECT
      GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)),
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE
           THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) ELSE 0 END,
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 1 ELSE 0 END
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))), 0),
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE
                        THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices
    WHERE clinic_id = p_clinic_id AND status IN ('kesildi','kismi_odendi');
  END IF;

  IF v_total_due <= 0 THEN
    RETURN NULL;   -- borç yok → sessiz geç (cron döngüsünü bozma)
  END IF;

  v_title := CASE p_severity
               WHEN 'urgent'  THEN '🔴 ACİL: Ödeme Bekliyor'
               WHEN 'warning' THEN '⚠️ Ödeme Hatırlatması'
               ELSE                'Ödeme Hatırlatması' END;
  v_body  := CONCAT_WS(' ',
              CASE WHEN v_overdue_count > 0 THEN v_overdue_count::TEXT || ' fatura vadesini aştı.' ELSE NULL END,
              'Açık borç: ₺' || TO_CHAR(v_total_due, 'FM999G999G990D00') || '.',
              CASE WHEN p_message IS NOT NULL AND LENGTH(BTRIM(p_message)) > 0 THEN '— ' || BTRIM(p_message) ELSE NULL END);

  -- Hatırlatma kaydı (channel: birincil kanal etiketi — in_app her zaman var)
  INSERT INTO payment_reminders (
    lab_id, clinic_id, invoice_id, channel, tone, subject, body, status,
    sent_by, sent_at, total_due, overdue_due, overdue_count, message, severity
  ) VALUES (
    p_lab_id, p_clinic_id, p_invoice_id, 'in_app', p_tone, v_title, v_body, 'sent',
    p_sent_by, NOW(), v_total_due, v_overdue_due, v_overdue_count,
    NULLIF(BTRIM(p_message), ''), p_severity
  )
  RETURNING id INTO v_reminder_id;

  v_url := '/(clinic)/finance?tab=overview';

  -- Uygulama içi bildirim (her zaman) — WhatsApp bunu trigger'la yakalar
  WITH inserted AS (
    INSERT INTO notifications (
      user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload
    )
    SELECT p.id, p_lab_id, 'payment', v_title, v_body,
      CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
      COALESCE(p_invoice_id, p_clinic_id), v_url,
      jsonb_build_object(
        'reminder_id', v_reminder_id, 'clinic_id', p_clinic_id, 'invoice_id', p_invoice_id,
        'total_due', v_total_due, 'overdue_due', v_overdue_due, 'overdue_count', v_overdue_count,
        'severity', p_severity, 'message', p_message,
        'channels', to_jsonb(p_channels)   -- WhatsApp trigger politikayı buradan da okuyabilir
      )
    FROM profiles p
    WHERE p.clinic_id = p_clinic_id AND p.user_type IN ('clinic_admin','clinic_secretary','doctor')
    RETURNING user_id
  )
  SELECT COUNT(*), array_agg(user_id) INTO v_recipients, v_user_ids FROM inserted;

  UPDATE payment_reminders SET recipients_count = v_recipients WHERE id = v_reminder_id;

  -- ── E-posta kanalı (politikada 'email' varsa) ──────────────────────────
  IF (p_channels @> ARRAY['email']) AND v_user_ids IS NOT NULL AND array_length(v_user_ids,1) > 0 THEN
    BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_fn_secret' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
    BEGIN SELECT decrypted_secret INTO v_anon   FROM vault.decrypted_secrets WHERE name='net_anon_key'    LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;

    IF v_anon IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || v_anon, 'apikey', v_anon,
            'x-notify-secret', COALESCE(v_secret,'')),
          body := jsonb_build_object(
            'userIds', to_jsonb(v_user_ids), 'category', 'payment', 'notificationId', v_reminder_id,
            'payload', jsonb_build_object(
              'title', v_title, 'body', v_body, 'actionUrl', v_url,
              'resourceType', CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
              'resourceId', COALESCE(p_invoice_id, p_clinic_id)::text,
              'extra', jsonb_build_object('clinicName', v_clinic_name, 'totalDue', v_total_due, 'overdueCount', v_overdue_count)))
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN v_reminder_id;
END;
$function$;

-- ── Manuel wrapper (istemci bu imzayı çağırıyor) ───────────────────────────
CREATE OR REPLACE FUNCTION public.send_payment_reminder(
  p_clinic_id  uuid,
  p_invoice_id uuid  DEFAULT NULL::uuid,
  p_message    text  DEFAULT NULL::text,
  p_severity   text  DEFAULT 'info'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_tone      TEXT;
  v_channels  TEXT[];
  v_total     NUMERIC := 0;
  v_id        UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
    RAISE EXCEPTION 'Hatırlatma gönderme yetkiniz yok.';
  END IF;
  IF p_severity NOT IN ('info','warning','urgent') THEN RAISE EXCEPTION 'Geçersiz öncelik seviyesi.'; END IF;

  SELECT lab_id INTO v_lab_id FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı.'; END IF;
  IF v_lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'Farklı bir laboratuvarın kliniğine hatırlatma gönderemezsiniz.'; END IF;

  -- Ön kontrol: açık borç var mı? (yoksa kullanıcıya net hata)
  IF p_invoice_id IS NOT NULL THEN
    SELECT GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) INTO v_total
      FROM invoices WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))),0) INTO v_total
      FROM invoices WHERE clinic_id = p_clinic_id AND status IN ('kesildi','kismi_odendi');
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Bu klinik için açık borç yok, hatırlatma gerekmiyor.'; END IF;

  -- Manuel: ton öncelikten (severity) türetilir; kanallar lab politikasından
  v_tone := CASE p_severity WHEN 'urgent' THEN 'firm' WHEN 'warning' THEN 'standard' ELSE 'gentle' END;
  SELECT COALESCE(payment_reminder_channels, ARRAY['in_app','email']) INTO v_channels
    FROM lab_settings WHERE lab_id = v_lab_id LIMIT 1;
  IF v_channels IS NULL THEN v_channels := ARRAY['in_app','email']; END IF;

  v_id := _send_payment_reminder_core(v_lab_id, p_clinic_id, p_invoice_id, v_tone, p_message, p_severity, v_channels, v_user_id);
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_payment_reminder(uuid, uuid, text, text) TO authenticated;

-- ── Otomatik (cron) ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_auto_payment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab       RECORD;
  v_clinic    RECORD;
  v_severity  TEXT;
  v_sent      INT := 0;
BEGIN
  FOR v_lab IN
    SELECT lab_id, payment_reminder_frequency_days AS freq,
           COALESCE(payment_reminder_channels, ARRAY['in_app','email']) AS channels,
           COALESCE(payment_reminder_tone, 'standard') AS tone,
           GREATEST(0, COALESCE(payment_reminder_min_days_overdue, 1)) AS min_days
    FROM lab_settings
    WHERE payment_reminder_auto = true
  LOOP
    v_severity := CASE v_lab.tone WHEN 'firm' THEN 'urgent' WHEN 'gentle' THEN 'info' ELSE 'warning' END;

    FOR v_clinic IN
      SELECT i.clinic_id
      FROM invoices i
      WHERE i.lab_id = v_lab.lab_id
        AND i.status IN ('kesildi','kismi_odendi')
        AND i.due_date IS NOT NULL
        AND i.due_date <= CURRENT_DATE - v_lab.min_days
        AND i.clinic_id IS NOT NULL
      GROUP BY i.clinic_id
      HAVING SUM(GREATEST(0, COALESCE(i.total_amount,0) - COALESCE(i.paid_amount,0))) > 0
    LOOP
      -- Sıklık kapısı: bu kliniğe son hatırlatmadan freq gün geçmemişse atla
      IF EXISTS (
        SELECT 1 FROM payment_reminders r
        WHERE r.clinic_id = v_clinic.clinic_id
          AND r.sent_at > NOW() - (v_lab.freq || ' days')::interval
      ) THEN CONTINUE; END IF;

      BEGIN
        PERFORM _send_payment_reminder_core(
          v_lab.lab_id, v_clinic.clinic_id, NULL, v_lab.tone, NULL, v_severity, v_lab.channels, NULL);
        v_sent := v_sent + 1;
      EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    END LOOP;
  END LOOP;
  RETURN v_sent;
END;
$function$;

-- ── WhatsApp trigger: hatırlatma satırında politikayla geç ────────────────
CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_anon   text;
  v_wa_ok  boolean;
BEGIN
  -- Müşteriye/kliniğe giden kategoriler (payment 2026-07-29 eklendi)
  IF NEW.category NOT IN ('new_order','delivery','approval','payment') THEN
    RETURN NEW;
  END IF;

  -- Ödeme HATIRLATMASI satırı (reminder_id'li) → yalnız lab politikası WhatsApp
  -- içeriyorsa gönder. Fatura olayları (reminder_id YOK) mevcut davranışta kalır.
  IF NEW.category = 'payment' AND (NEW.payload ? 'reminder_id') THEN
    SELECT (payment_reminder_channels @> ARRAY['whatsapp']) INTO v_wa_ok
      FROM lab_settings WHERE lab_id = NEW.lab_id LIMIT 1;
    IF NOT COALESCE(v_wa_ok, false) THEN RETURN NEW; END IF;
  END IF;

  SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1;
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;

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
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END;
$function$;

-- ── Cron: her gün 07:00 UTC (10:00 TR) ────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('auto_payment_reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('auto_payment_reminders', '0 7 * * *', $$SELECT public.run_auto_payment_reminders();$$);
