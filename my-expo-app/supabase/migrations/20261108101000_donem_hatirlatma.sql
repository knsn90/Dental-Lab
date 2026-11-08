-- 20261108101000_donem_hatirlatma — gecikmiş dönemleri listeleyen tek hatırlatma mesajı (plan 2/5, Görev 4).
--   Örnek gövde: "2 fatura vadesini aştı. Eylül ₺1.600,00 ve Ekim ₺5.900,00, toplam ₺7.500,00 gecikti. Açık borç: …"
--   * _overdue_periods_text(jsonb, date): saf (STABLE: to_char lc_numeric'e bağlı), tablo okumaz. Girdi [{currency, issue_date, due_date, open}].
--     Yalnız due_date < bugün ve open > 0. Dönem = coalesce(issue_date, due_date) ayı. Para birimi başına
--     eskiden yeniye "A, B ve C" + (2+ dönemde) ", toplam X"; para birimleri "; " ile (toplamı büyük olan önce),
--     sonunda " gecikti.". Yıl yalnız bugünün yılından farklıysa. Tutar biçimi _reminder_amounts ile aynı
--     (sembol eşlemesi + to_char FM999G999G990D00). Ay adları Türkçe (hatırlatma gövdesi bugün de Türkçe).
--     Satır yoksa NULL.
--   * _reminder_periods(lab, clinic): kliniğin kesildi/kismi_odendi ve total > paid_amount faturaları
--     (açık = total - paid_amount; İND/DZ alacakları payments → paid_amount yoluyla zaten düşülü).
--     Taslak ve iptal kapsam dışı.
--   * _send_payment_reminder_core: yalnız gövde kurulumu. p_invoice_id NULL iken "N fatura vadesini aştı."
--     cümlesinden sonra dönem metni eklenir (NULL ise CONCAT_WS atlar). Alıcılar, kanallar, dueText, payload
--     anahtarları ve WhatsApp parametreleri aynı. CREATE OR REPLACE → ACL korunur.
--   * Yeni iki fonksiyon authenticated/anon'a kapalı (_reminder_amounts ile aynı: postgres + service_role).
BEGIN;
SET LOCAL lock_timeout = '3s';

-- === Saf dönem metni ===
CREATE OR REPLACE FUNCTION public._overdue_periods_text(p_rows jsonb, p_today date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with r as (
    select coalesce(nullif(upper(btrim(x->>'currency')), ''), 'TRY') as ccy,
           date_trunc('month', coalesce((x->>'issue_date')::date, (x->>'due_date')::date))::date as m,
           (x->>'open')::numeric as amt
      from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) x
     where (x->>'due_date')::date < p_today
       and coalesce((x->>'open')::numeric, 0) > 0
  ), per as (
    select ccy, m, sum(amt) as amt,
           case ccy when 'EUR' then '€' when 'TRY' then '₺' when 'USD' then '$' when 'GBP' then '£'
                    else ccy || ' ' end as sym
      from r
     group by ccy, m
  ), lbl as (
    select ccy, sym, m, amt,
           (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])
             [extract(month from m)::int]
           || case when extract(year from m) <> extract(year from p_today)
                   then ' ' || extract(year from m)::int::text else '' end
           || ' ' || sym || to_char(amt, 'FM999G999G990D00') as part,
           row_number() over (partition by ccy order by m) as rn,
           count(*) over (partition by ccy) as n
      from per
  ), cc as (
    select ccy, min(sym) as sym, sum(amt) as tot, max(n) as n,
           string_agg(case when rn = 1 then '' when rn = n then ' ve ' else ', ' end || part, '' order by rn) as txt
      from lbl
     group by ccy
  )
  select string_agg(txt || case when n > 1 then ', toplam ' || sym || to_char(tot, 'FM999G999G990D00') else '' end,
                    '; ' order by tot desc, ccy) || ' gecikti.'
    from cc
$function$;
REVOKE ALL ON FUNCTION public._overdue_periods_text(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._overdue_periods_text(jsonb, date) TO service_role;

-- === Kliniğin açık faturaları (dönem girdisi) ===
CREATE OR REPLACE FUNCTION public._reminder_periods(p_lab uuid, p_clinic uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'currency',   coalesce(nullif(upper(btrim(i.currency)), ''), 'TRY'),
           'issue_date', i.issue_date,
           'due_date',   i.due_date,
           'open',       i.total - i.paid_amount)
         order by i.issue_date, i.due_date, i.id), '[]'::jsonb)
    from public.invoices i
   where i.lab_id = p_lab and i.clinic_id = p_clinic
     and i.status in ('kesildi', 'kismi_odendi')
     and i.total > i.paid_amount
$function$;
REVOKE ALL ON FUNCTION public._reminder_periods(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reminder_periods(uuid, uuid) TO service_role;

-- === Gönderici çekirdeği: yalnız gövde kurulumu (CREATE OR REPLACE → ACL korunur) ===
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
  v_period_text TEXT;
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  -- 20261026110000: tutar tek kaynaktan (kliniğin görünen bakiyesi, avans düşülmüş; lab günü)
  SELECT a.total_due, a.overdue_due, a.overdue_count, a.due_text, a.by_ccy
    INTO v_total_due, v_overdue_due, v_overdue_count, v_due_text, v_by_ccy
    FROM public._reminder_amounts(p_lab_id, p_clinic_id, p_invoice_id) a;
  IF COALESCE(v_total_due, 0) <= 0 THEN RETURN NULL; END IF;

  v_title := CASE p_severity WHEN 'urgent' THEN '🔴 ACİL: Ödeme Bekliyor' WHEN 'warning' THEN '⚠️ Ödeme Hatırlatması' ELSE 'Ödeme Hatırlatması' END;
  IF p_invoice_id IS NULL THEN v_period_text := public._overdue_periods_text(public._reminder_periods(p_lab_id, p_clinic_id), public.lab_today(p_lab_id)); END IF;
  v_body := CONCAT_WS(' ',
    CASE WHEN v_overdue_count > 0 THEN v_overdue_count::TEXT || ' fatura vadesini aştı.' ELSE NULL END,
    v_period_text,
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
END; $function$
;

NOTIFY pgrst, 'reload schema';

COMMIT;
