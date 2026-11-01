-- 20261026110000_hatirlatma_tek_tanim.sql
-- Tek tanım (Y2) Task 5: ödeme hatırlatmasının tutarı ve "kime" kararı kliniğin GÖRDÜĞÜ rakamdan
-- (v_clinic_balance_ccy: kesilmiş faturalar − dağıtılmamış avans; vadesi geçmiş = overdue_net; lab günü).
--  * _reminder_amounts / _clinics_to_remind: tek kaynak yardımcılar (yalnız yetkili fonksiyonlar çağırır).
--  * _send_payment_reminder_core, send_payment_reminder(klinik), send_payment_reminders_bulk,
--    run_auto_payment_reminders: tutar ve seçim yardımcılardan; avansı borcu karşılayan kliniğe gitmez.
--  * my_payment_reminder (popup), my_open_balance_by_currency (toplu ödeme): kliniğin görünen bakiyesi.
--  Gönderim (bildirim, e-posta, WhatsApp kopyası), kanallar, zamanlama değişmez.
-- Geri alma: rollbacks/20261026110000_hatirlatma_tek_tanim.down.sql

-- Hatırlatma tutarı — TEK kaynak (tek fatura ya da klinik geneli). Klinik geneli: kliniğin
-- görünen bakiyesi (v_clinic_balance_ccy, avans düşülmüş); vadesi geçmiş = overdue_net.
create or replace function public._reminder_amounts(p_lab uuid, p_clinic uuid, p_invoice uuid)
returns table(total_due numeric, overdue_due numeric, overdue_count int, due_text text, by_ccy jsonb)
language sql stable set search_path = public as $$
  with today as (select public.lab_today(p_lab) as d),
  amt as (
    select v.currency as ccy, greatest(v.balance, 0) as total, v.overdue_net as overdue
      from public.v_clinic_balance_ccy v
     where p_invoice is null and v.clinic_id = p_clinic and v.lab_id = p_lab
    union all
    select coalesce(nullif(upper(btrim(i.currency)), ''), 'TRY'),
           greatest(0, coalesce(i.total, 0) - coalesce(i.paid_amount, 0)),
           case when i.due_date is not null and i.due_date < (select d from today)
                then greatest(0, coalesce(i.total, 0) - coalesce(i.paid_amount, 0)) else 0 end
      from public.invoices i
     where p_invoice is not null and i.id = p_invoice and i.clinic_id = p_clinic
  ), cnt as (
    select count(*)::int as n from public.invoices i, today
     where i.clinic_id = p_clinic and i.lab_id = p_lab
       and ((p_invoice is not null and i.id = p_invoice)
         or (p_invoice is null and i.status in ('kesildi', 'kismi_odendi')))
       and i.due_date is not null and i.due_date < today.d and i.paid_amount < i.total
  )
  select coalesce(sum(a.total), 0), coalesce(sum(a.overdue), 0), (select n from cnt),
         string_agg(case a.ccy when 'EUR' then '€' when 'TRY' then '₺' when 'USD' then '$' when 'GBP' then '£'
                               else a.ccy || ' ' end || to_char(a.total, 'FM999G999G990D00'),
                    ' + ' order by a.total desc) filter (where a.total > 0),
         coalesce(jsonb_object_agg(a.ccy, round(a.total, 2)) filter (where a.total > 0), '{}'::jsonb)
    from amt a
$$;

-- Hatırlatılacak klinikler — TEK kural: avans düşülmüş vadesi geçmiş borcu olan (overdue_net > 0)
-- ve en az bir açık faturası due_date <= lab günü − p_min_days olan klinikler.
create or replace function public._clinics_to_remind(p_lab uuid, p_min_days int)
returns setof uuid language sql stable set search_path = public as $$
  select v.clinic_id
    from public.v_clinic_balance_ccy v
   where v.lab_id = p_lab
   group by v.clinic_id
  having sum(v.overdue_net) > 0
     and exists (select 1 from public.invoices i
                  where i.clinic_id = v.clinic_id and i.lab_id = p_lab
                    and i.status in ('kesildi', 'kismi_odendi') and i.paid_amount < i.total
                    and i.due_date is not null and i.due_date <= public.lab_today(p_lab) - greatest(p_min_days, 0))
$$;

revoke all on function public._reminder_amounts(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._clinics_to_remind(uuid, int) from public, anon, authenticated;

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
  -- 20261026110000: tutar tek kaynaktan (kliniğin görünen bakiyesi, avans düşülmüş; lab günü)
  SELECT a.total_due, a.overdue_due, a.overdue_count, a.due_text, a.by_ccy
    INTO v_total_due, v_overdue_due, v_overdue_count, v_due_text, v_by_ccy
    FROM public._reminder_amounts(p_lab_id, p_clinic_id, p_invoice_id) a;
  IF COALESCE(v_total_due, 0) <= 0 THEN RETURN NULL; END IF;

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
  -- 20261026110000: borç kontrolü hatırlatmanın göndereceği tutarla aynı kaynaktan
  SELECT a.total_due INTO v_total FROM public._reminder_amounts(v_lab_id, p_clinic_id, p_invoice_id) a;
  v_total := COALESCE(v_total, 0);
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
    -- 20261026110000: Özet'teki "hatırlatılacak" listesiyle aynı kural (avans düşülmüş vadesi geçmiş)
    SELECT c AS clinic_id FROM public._clinics_to_remind(v_lab_id, 1) c
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
      -- 20261026110000: tek kural; "en az N gün gecikmiş" ayarı korunur, avansı borcu karşılayan atlanır
      SELECT c AS clinic_id FROM public._clinics_to_remind(v_lab.lab_id, v_lab.min_days) c
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

CREATE OR REPLACE FUNCTION public.my_payment_reminder()
 RETURNS TABLE(lab_id uuid, lab_name text, currency text, overdue_amount numeric, total_balance numeric, overdue_count integer, oldest_due_date date, days_late integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261026110000: tutarlar kliniğin görünen bakiyesinden (v_clinic_balance_ccy; avans düşülmüş, lab günü)
  select v.lab_id,
         l.name,
         v.currency,
         sum(v.overdue_net),
         sum(greatest(v.balance, 0)),
         sum((select count(*) from invoices i
               where i.clinic_id = v.clinic_id and i.lab_id = v.lab_id and coalesce(i.currency, 'TRY') = v.currency
                 and i.status not in ('taslak', 'iptal') and i.paid_amount < i.total
                 and i.due_date < public.lab_today(v.lab_id)))::int,
         min(v.oldest_overdue_date),
         coalesce((public.lab_today(v.lab_id) - min(v.oldest_overdue_date))::int, 0)
    from v_clinic_balance_ccy v
    left join labs l on l.id = v.lab_id
   where v.clinic_id in (select public.my_clinic_ids())
     -- Klinikte faturayı görebilen kullanıcı (yönetici / yetkili sekreter / yöneticisiz klinikteki hekim)
     and public.can_view_clinic_billing(v.clinic_id)
   group by v.lab_id, l.name, v.currency
  -- Yalnız avans düşüldükten sonra gerçekten gecikmiş bakiyesi olanlar; yoksa popup açılmaz.
  having sum(v.overdue_net) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.my_open_balance_by_currency()
 RETURNS TABLE(currency text, balance numeric, invoice_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261026110000: kliniğin görünen bakiyesi (avans düşülmüş), döviz başına
  SELECT v.currency::text,
         round(greatest(v.balance, 0), 2),
         (SELECT count(*) FROM invoices i
           WHERE i.clinic_id = v.clinic_id AND coalesce(i.currency, 'TRY') = v.currency
             AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount)::int
    FROM v_clinic_balance_ccy v
   WHERE v.clinic_id = get_my_clinic_id()
     AND get_my_clinic_id() IS NOT NULL
     -- 20261025168000: bakiye = klinik fatura yetkisi
     AND public.can_view_clinic_billing(get_my_clinic_id())
     AND v.balance > 0
   ORDER BY 2 DESC;
$function$;
