-- 20260915093000_payment_reminder_admin_copy.sql
--
-- Ödeme hatırlatması gönderildiğinde lab yöneticilerine (admin + lab müdürü)
-- WhatsApp NÜSHASI. Manuel ve otomatik (run_auto_payment_reminders) hatırlatmalar
-- aynı çekirdekten geçtiği için ikisi de kapsanır. Kliniğin kanal politikasından
-- bağımsızdır; admin uygulama-içi kutusuna kayıt düşmez.
-- send-whatsapp-meta __admin_copy=true görünce onaylı 'odeme_hatirlatma'
-- şablonunu "Nüsha · <Klinik>: <metin>" ile gönderir.
-- Gövde 20260915090000 (para birimi düzeltmesi) üzerine kuruludur.

CREATE OR REPLACE FUNCTION public._send_payment_reminder_core(p_lab_id uuid, p_clinic_id uuid, p_invoice_id uuid, p_tone text, p_message text, p_severity text, p_channels text[], p_sent_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_name TEXT; v_total_due NUMERIC := 0; v_overdue_due NUMERIC := 0; v_overdue_count INT := 0;
  v_reminder_id UUID; v_title TEXT; v_body TEXT; v_recipients INT := 0; v_user_ids UUID[];
  v_url TEXT; v_secret TEXT; v_anon TEXT;
  v_due_text TEXT; v_by_ccy JSONB := '{}'::jsonb;
  v_admin_ids UUID[];
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  IF p_invoice_id IS NOT NULL THEN
    SELECT GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)),
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) ELSE 0 END,
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 1 ELSE 0 END
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))),0),
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) ELSE 0 END),0),
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices WHERE clinic_id = p_clinic_id AND status IN ('kesildi','kismi_odendi');
  END IF;
  IF v_total_due <= 0 THEN RETURN NULL; END IF;

  -- Para birimi başına açık tutar — faturanın KENDİ para birimi (sabit ₺ yasak).
  SELECT string_agg(
           CASE t.ccy WHEN 'EUR' THEN '€' WHEN 'TRY' THEN '₺' WHEN 'USD' THEN '$' WHEN 'GBP' THEN '£'
                      ELSE t.ccy || ' ' END
           || TO_CHAR(t.amt, 'FM999G999G990D00'),
           ' + ' ORDER BY t.amt DESC),
         COALESCE(jsonb_object_agg(t.ccy, ROUND(t.amt, 2)), '{}'::jsonb)
    INTO v_due_text, v_by_ccy
    FROM (
      SELECT COALESCE(NULLIF(UPPER(BTRIM(currency)), ''), 'TRY') AS ccy,
             SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))) AS amt
        FROM invoices
       WHERE clinic_id = p_clinic_id
         AND ((p_invoice_id IS NOT NULL AND id = p_invoice_id)
           OR (p_invoice_id IS NULL AND status IN ('kesildi','kismi_odendi')))
       GROUP BY 1
      HAVING SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))) > 0
    ) t;

  v_title := CASE p_severity WHEN 'urgent' THEN '🔴 ACİL: Ödeme Bekliyor' WHEN 'warning' THEN '⚠️ Ödeme Hatırlatması' ELSE 'Ödeme Hatırlatması' END;
  v_body := CONCAT_WS(' ',
    CASE WHEN v_overdue_count > 0 THEN v_overdue_count::TEXT || ' fatura vadesini aştı.' ELSE NULL END,
    'Açık borç: ' || COALESCE(v_due_text, TO_CHAR(v_total_due, 'FM999G999G990D00')) || '.',
    CASE WHEN p_message IS NOT NULL AND LENGTH(BTRIM(p_message)) > 0 THEN '— ' || BTRIM(p_message) ELSE NULL END);
  INSERT INTO payment_reminders (lab_id, clinic_id, invoice_id, channel, tone, subject, body, status, sent_by, sent_at, total_due, overdue_due, overdue_count, message, severity)
  VALUES (p_lab_id, p_clinic_id, p_invoice_id, 'in_app', p_tone, v_title, v_body, 'sent', p_sent_by, NOW(), v_total_due, v_overdue_due, v_overdue_count, NULLIF(BTRIM(p_message),''), p_severity)
  RETURNING id INTO v_reminder_id;
  v_url := '/(clinic)/finance?tab=overview';
  WITH inserted AS (
    INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    SELECT p.id, p_lab_id, 'payment', v_title, v_body,
      CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
      COALESCE(p_invoice_id, p_clinic_id), v_url,
      jsonb_build_object('reminder_id', v_reminder_id, 'clinic_id', p_clinic_id, 'invoice_id', p_invoice_id,
        'total_due', v_total_due, 'totals_by_currency', v_by_ccy,
        'overdue_due', v_overdue_due, 'overdue_count', v_overdue_count,
        'severity', p_severity, 'message', p_message, 'channels', to_jsonb(p_channels))
    FROM profiles p WHERE p.clinic_id = p_clinic_id AND p.user_type IN ('clinic_admin','clinic_secretary','doctor')
    RETURNING user_id
  )
  SELECT COUNT(*), array_agg(user_id) INTO v_recipients, v_user_ids FROM inserted;
  UPDATE payment_reminders SET recipients_count = v_recipients WHERE id = v_reminder_id;
  IF (p_channels @> ARRAY['email']) AND v_user_ids IS NOT NULL AND array_length(v_user_ids,1) > 0 THEN
    BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
    BEGIN SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;
    IF v_anon IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
          body := jsonb_build_object('userIds', to_jsonb(v_user_ids), 'category','payment','notificationId', v_reminder_id,
            'payload', jsonb_build_object('title', v_title, 'body', v_body, 'actionUrl', v_url,
              'resourceType', CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
              'resourceId', COALESCE(p_invoice_id, p_clinic_id)::text,
              'extra', jsonb_build_object('clinicName', v_clinic_name, 'totalDue', v_total_due,
                                          'totalsByCurrency', v_by_ccy, 'dueText', v_due_text,
                                          'overdueCount', v_overdue_count))));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;
  -- ── ADMİN NÜSHASI (WhatsApp) ─────────────────────────────────────────────
  -- Kullanıcı kararı: hatırlatma gönderildiğinde bir kopyası lab yöneticilerine
  -- (admin + lab müdürü) KESİNLİKLE WhatsApp'tan gider — kliniğin kanal
  -- politikasından bağımsız. Uygulama içi bildirim YAZILMAZ (admin kutusu
  -- kirlenmesin); doğrudan send-whatsapp-meta çağrılır, __admin_copy işaretiyle.
  -- Hata hatırlatmayı asla bozmaz.
  BEGIN
    SELECT array_agg(p.id) INTO v_admin_ids
      FROM profiles p
     WHERE (p.lab_id = p_lab_id OR p.id = p_lab_id)
       AND COALESCE(p.is_active, true)
       AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'));
    IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
      IF v_anon IS NULL THEN
        BEGIN SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;
      END IF;
      IF v_secret IS NULL THEN
        BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
      END IF;
      IF v_anon IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
          body := jsonb_build_object(
            'userIds', to_jsonb(v_admin_ids),
            'category', 'payment',
            'resource_type', CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
            'resource_id', COALESCE(p_invoice_id, p_clinic_id)::text,
            'payload', jsonb_build_object(
              '__admin_copy', true,
              '__clinic_name', COALESCE(v_clinic_name, 'Klinik'),
              '__body', v_body,
              '__lab_id', p_lab_id::text,
              'reminder_id', v_reminder_id)));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_reminder_id;
END; $function$;
