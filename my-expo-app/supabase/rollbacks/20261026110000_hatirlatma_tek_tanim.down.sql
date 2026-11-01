-- Geri alma: 20261026110000_hatirlatma_tek_tanim (canlı tanımlar .before.txt'ten)
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
         AND public._user_can_view_clinic_billing(p.id, p_clinic_id)
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
       AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
        AND public._user_has_lab_finance(p.id, p_lab_id);
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

CREATE OR REPLACE FUNCTION public.my_open_balance_by_currency()
 RETURNS TABLE(currency text, balance numeric, invoice_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(i.currency, 'TRY')::text,
         round(SUM(i.total - i.paid_amount), 2),
         COUNT(*)::int
    FROM invoices i
   WHERE i.clinic_id = get_my_clinic_id()
     AND get_my_clinic_id() IS NOT NULL
     -- 20261025168000: bakiye = klinik fatura yetkisi
     AND public.can_view_clinic_billing(get_my_clinic_id())
     AND i.status IN ('kesildi', 'kismi_odendi')
     AND i.total > i.paid_amount
   GROUP BY COALESCE(i.currency, 'TRY')
   HAVING SUM(i.total - i.paid_amount) > 0
   ORDER BY 2 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.my_payment_reminder()
 RETURNS TABLE(lab_id uuid, lab_name text, currency text, overdue_amount numeric, total_balance numeric, overdue_count integer, oldest_due_date date, days_late integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select i.lab_id,
           i.currency,
           i.due_date,
           (coalesce(i.total, 0) - coalesce(i.paid_amount, 0)) as kalan
      from invoices i
     where i.clinic_id in (select public.my_clinic_ids())
       -- Klinikte faturayı görebilen kullanıcı (yönetici / yetkili sekreter / yöneticisiz klinikteki hekim)
       and public.can_view_clinic_billing(i.clinic_id)
       -- Taslak fatura bakiyeye GİRMEZ (teslimde otomatik oluşan taslaklar dahil).
       and i.status not in ('taslak', 'iptal')
       and (coalesce(i.total, 0) - coalesce(i.paid_amount, 0)) > 0
  )
  select m.lab_id,
         l.name,
         m.currency,
         coalesce(sum(m.kalan) filter (where m.due_date < current_date), 0),
         coalesce(sum(m.kalan), 0),
         (count(*) filter (where m.due_date < current_date))::int,
         min(m.due_date) filter (where m.due_date < current_date),
         coalesce((current_date - min(m.due_date) filter (where m.due_date < current_date))::int, 0)
    from mine m
    left join labs l on l.id = m.lab_id
   group by m.lab_id, l.name, m.currency
  -- Yalnız gerçekten gecikmiş bakiyesi olanlar satır döndürür; yoksa popup hiç açılmaz.
  having coalesce(sum(m.kalan) filter (where m.due_date < current_date), 0) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.run_auto_payment_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab RECORD; v_clinic RECORD; v_severity TEXT; v_sent INT := 0;
BEGIN
  FOR v_lab IN
    SELECT lab_id, payment_reminder_frequency_days AS freq,
      COALESCE(payment_reminder_channels, ARRAY['in_app','email']) AS channels,
      COALESCE(payment_reminder_tone, 'standard') AS tone,
      GREATEST(0, COALESCE(payment_reminder_min_days_overdue, 1)) AS min_days
    FROM lab_settings WHERE payment_reminder_auto = true
  LOOP
    v_severity := CASE v_lab.tone WHEN 'firm' THEN 'urgent' WHEN 'gentle' THEN 'info' ELSE 'warning' END;
    FOR v_clinic IN
      SELECT i.clinic_id FROM invoices i
      WHERE i.lab_id = v_lab.lab_id AND i.status IN ('kesildi','kismi_odendi')
        AND i.due_date IS NOT NULL AND i.due_date <= CURRENT_DATE - v_lab.min_days AND i.clinic_id IS NOT NULL
      GROUP BY i.clinic_id
      HAVING SUM(GREATEST(0, COALESCE(i.total_amount,0) - COALESCE(i.paid_amount,0))) > 0
    LOOP
      IF EXISTS (SELECT 1 FROM payment_reminders r WHERE r.clinic_id = v_clinic.clinic_id AND r.sent_at > NOW() - (v_lab.freq || ' days')::interval) THEN CONTINUE; END IF;
      BEGIN
        PERFORM _send_payment_reminder_core(v_lab.lab_id, v_clinic.clinic_id, NULL, v_lab.tone, NULL, v_severity, v_lab.channels, NULL);
        v_sent := v_sent + 1;
      EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    END LOOP;
  END LOOP;
  RETURN v_sent;
END; $function$;

CREATE OR REPLACE FUNCTION public.send_payment_reminder(p_clinic_id uuid, p_invoice_id uuid DEFAULT NULL::uuid, p_message text DEFAULT NULL::text, p_severity text DEFAULT 'info'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID := auth.uid(); v_user_type TEXT; v_role TEXT; v_lab_id UUID; v_tone TEXT; v_channels TEXT[]; v_total NUMERIC := 0; v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN RAISE EXCEPTION 'Hatırlatma gönderme yetkiniz yok.'; END IF;
  IF p_severity NOT IN ('info','warning','urgent') THEN RAISE EXCEPTION 'Geçersiz öncelik seviyesi.'; END IF;
  SELECT lab_id INTO v_lab_id FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı.'; END IF;
  IF v_lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'Farklı bir laboratuvarın kliniğine hatırlatma gönderemezsiniz.'; END IF;
  IF p_invoice_id IS NOT NULL THEN
    SELECT GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) INTO v_total FROM invoices WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))),0) INTO v_total FROM invoices WHERE clinic_id = p_clinic_id AND status IN ('kesildi','kismi_odendi');
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Bu klinik için açık borç yok, hatırlatma gerekmiyor.'; END IF;
  v_tone := CASE p_severity WHEN 'urgent' THEN 'firm' WHEN 'warning' THEN 'standard' ELSE 'gentle' END;
  SELECT COALESCE(payment_reminder_channels, ARRAY['in_app','email']) INTO v_channels FROM lab_settings WHERE lab_id = v_lab_id LIMIT 1;
  IF v_channels IS NULL THEN v_channels := ARRAY['in_app','email']; END IF;
  v_id := _send_payment_reminder_core(v_lab_id, p_clinic_id, p_invoice_id, v_tone, p_message, p_severity, v_channels, v_user_id);
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.send_payment_reminders_bulk(p_message text DEFAULT NULL::text, p_severity text DEFAULT 'warning'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID := auth.uid();
  v_user_type TEXT;
  v_role      TEXT;
  v_lab_id    UUID;
  v_clinic    RECORD;
  v_sent      INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Yetki yok.';
  END IF;
  v_lab_id := get_my_lab_id();

  FOR v_clinic IN
    SELECT clinic_id
    FROM invoices
    WHERE lab_id = v_lab_id
      AND status IN ('kesildi','kismi_odendi')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND clinic_id IS NOT NULL
    GROUP BY clinic_id
    HAVING SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))) > 0
  LOOP
    BEGIN
      PERFORM send_payment_reminder(v_clinic.clinic_id, NULL, p_message, p_severity);
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN v_sent;
END;
$function$;

drop function if exists public._clinics_to_remind(uuid, int);
drop function if exists public._reminder_amounts(uuid, uuid, uuid);
