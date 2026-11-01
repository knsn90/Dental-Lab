-- 20261025162000_clinic_billing_view.sql
-- Rol görünürlüğü paketi C (spec §2 karar 3, 4, 8): klinik tarafında fatura/tahsilat/bakiye yalnız
-- klinik yöneticisi ve billing_view'li sekreter; kliniğinde faturayı görebilen kimse yoksa hekim.
-- Ödeme hatırlatma alıcıları da aynı kurala (klinik) ve finans yetkisine (lab kopyası) bağlanır.
-- Lab tarafı dalları (paket A) değişmez. Geri alma: rollbacks/20261025162000_clinic_billing_view.down.sql


-- Rol anahtarı (my_role_key ile birebir), başka bir profil için
create or replace function public._profile_role_key(p_user_type text, p_role text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_user_type = 'admin' then 'admin'
    when p_user_type = 'lab' and p_role = 'manager' then 'lab_manager'
    when p_user_type = 'lab' and p_role = 'technician' then 'technician'
    when p_user_type = 'lab' and p_role = 'courier' then 'courier'
    when p_user_type = 'lab' then 'lab_manager'
    when p_user_type = 'doctor' then 'doctor'
    when p_user_type = 'clinic_admin' then 'clinic_admin'
    else 'technician' end
$$;

-- Başka bir lab kullanıcısının finans yetkisi (has_permission ile aynı kaynak: resolve_role_permissions)
create or replace function public._user_has_lab_finance(p_user uuid, p_lab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user and p.user_type in ('admin', 'lab')
       and (select bool_or(k = any (public.resolve_role_permissions(public._profile_role_key(p.user_type, p.role), p_lab)))
              from unnest(array['view_financials', 'view_finance', 'manage_finance']) k))
$$;

-- Klinik finansını görebilir mi (karar 3, 4): yönetici → evet; sekreter → billing_view (varsayılan evet);
-- hekim → billing_view açıkça true ya da kliniğinde faturayı görebilen aktif kimse yoksa.
-- p_clinic: faturanın/kaydın klinik kimliği (kanonik ya da çoklu-lab üyeliğindeki lab_clinic_id).
create or replace function public._user_can_view_clinic_billing(p_user uuid, p_clinic uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me record;
begin
  if p_user is null or p_clinic is null then return false; end if;
  select user_type, clinic_id, clinic_permissions into me from public.profiles where id = p_user;
  if not found or me.user_type not in ('clinic_admin', 'clinic_secretary', 'doctor') then return false; end if;
  -- kayıt kullanıcının kliniklerinden biri mi (my_clinic_ids ile aynı küme)
  if not (p_clinic = me.clinic_id or exists (
        select 1 from public.clinic_lab_memberships m
         where m.status = 'active' and m.lab_clinic_id = p_clinic
           and (m.member_profile_id = p_user or (me.clinic_id is not null and m.member_clinic_id = me.clinic_id)))) then
    return false;
  end if;
  if me.user_type = 'clinic_admin' then return true; end if;
  if me.user_type = 'clinic_secretary' then
    return coalesce((me.clinic_permissions ->> 'billing_view')::boolean, true);
  end if;
  -- hekim
  if coalesce((me.clinic_permissions ->> 'billing_view')::boolean, false) then return true; end if;
  return not exists (
    select 1 from public.profiles s
     where me.clinic_id is not null and s.clinic_id = me.clinic_id and s.id <> p_user
       and coalesce(s.is_active, true)
       and (s.user_type = 'clinic_admin'
            or (s.user_type = 'clinic_secretary' and coalesce((s.clinic_permissions ->> 'billing_view')::boolean, true))));
end;
$$;

create or replace function public.can_view_clinic_billing(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._user_can_view_clinic_billing(auth.uid(), p_clinic)
$$;

-- İstemci (klinik/hekim paneli): Finans menüsü, bakiye kartı, hatırlatma penceresi, Simanty cari
create or replace function public.my_clinic_billing_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(public._user_can_view_clinic_billing(auth.uid(), c)), false)
    from public.my_clinic_ids() c
$$;

revoke all on function public._user_has_lab_finance(uuid, uuid) from public, anon, authenticated;
revoke all on function public._user_can_view_clinic_billing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_clinic_billing(uuid) from public, anon;
revoke all on function public.my_clinic_billing_access() from public, anon;
grant execute on function public.can_view_clinic_billing(uuid) to authenticated;
grant execute on function public.my_clinic_billing_access() to authenticated;


drop policy if exists clinic_view_clinic_invoices on public.invoices;
create policy clinic_view_clinic_invoices on public.invoices as permissive for select to public
  using ((((clinic_id IS NOT NULL) AND (clinic_id = get_my_clinic_id()))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists clinic_view_multilab_invoices on public.invoices;
create policy clinic_view_multilab_invoices on public.invoices as permissive for select to public
  using ((((clinic_id IS NOT NULL) AND (clinic_id IN ( SELECT my_clinic_ids() AS my_clinic_ids)))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists doctor_view_own_clinic_invoices on public.invoices;
create policy doctor_view_own_clinic_invoices on public.invoices as permissive for select to public
  using ((((clinic_id = get_my_clinic_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'doctor'::text)))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists clinic_view_clinic_payments on public.payments;
create policy clinic_view_clinic_payments on public.payments as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = payments.invoice_id) AND (inv.clinic_id IS NOT NULL) AND (inv.clinic_id = get_my_clinic_id()))))) and exists (select 1 from public.invoices i2 where i2.id = payments.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists clinic_view_multilab_payments on public.payments;
create policy clinic_view_multilab_payments on public.payments as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = payments.invoice_id) AND (inv.clinic_id IS NOT NULL) AND (inv.clinic_id IN ( SELECT my_clinic_ids() AS my_clinic_ids)))))) and exists (select 1 from public.invoices i2 where i2.id = payments.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists doctor_view_own_clinic_payments on public.payments;
create policy doctor_view_own_clinic_payments on public.payments as permissive for select to public
  using ((((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = payments.invoice_id) AND (inv.clinic_id = get_my_clinic_id())))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'doctor'::text)))))) and exists (select 1 from public.invoices i2 where i2.id = payments.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists clinic_view_clinic_invoice_items on public.invoice_items;
create policy clinic_view_clinic_invoice_items on public.invoice_items as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = invoice_items.invoice_id) AND (inv.clinic_id IS NOT NULL) AND (inv.clinic_id = get_my_clinic_id()))))) and exists (select 1 from public.invoices i2 where i2.id = invoice_items.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists clinic_view_multilab_invoice_items on public.invoice_items;
create policy clinic_view_multilab_invoice_items on public.invoice_items as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = invoice_items.invoice_id) AND (inv.clinic_id IS NOT NULL) AND (inv.clinic_id IN ( SELECT my_clinic_ids() AS my_clinic_ids)))))) and exists (select 1 from public.invoices i2 where i2.id = invoice_items.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists doctor_view_own_clinic_invoice_items on public.invoice_items;
create policy doctor_view_own_clinic_invoice_items on public.invoice_items as permissive for select to public
  using ((((EXISTS ( SELECT 1
   FROM invoices inv
  WHERE ((inv.id = invoice_items.invoice_id) AND (inv.clinic_id = get_my_clinic_id())))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'doctor'::text)))))) and exists (select 1 from public.invoices i2 where i2.id = invoice_items.invoice_id and public.can_view_clinic_billing(i2.clinic_id)));

drop policy if exists payment_submissions_clinic_admin_select on public.payment_submissions;
create policy payment_submissions_clinic_admin_select on public.payment_submissions as permissive for select to public
  using (((is_clinic_admin() AND (clinic_id = ( SELECT profiles.clinic_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_submissions_clinic_secretary_select on public.payment_submissions;
create policy payment_submissions_clinic_secretary_select on public.payment_submissions as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'clinic_secretary'::text) AND (p.clinic_id = payment_submissions.clinic_id))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_submissions_doctor_select on public.payment_submissions;
create policy payment_submissions_doctor_select on public.payment_submissions as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'doctor'::text) AND (p.clinic_id = payment_submissions.clinic_id))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_submissions_clinic_admin_insert on public.payment_submissions;
create policy payment_submissions_clinic_admin_insert on public.payment_submissions as permissive for insert to public
  with check (((is_clinic_admin() AND (clinic_id = ( SELECT profiles.clinic_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_submissions_clinic_secretary_insert on public.payment_submissions;
create policy payment_submissions_clinic_secretary_insert on public.payment_submissions as permissive for insert to public
  with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'clinic_secretary'::text) AND (p.clinic_id = payment_submissions.clinic_id))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_submissions_doctor_insert on public.payment_submissions;
create policy payment_submissions_doctor_insert on public.payment_submissions as permissive for insert to public
  with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'doctor'::text) AND (p.clinic_id = payment_submissions.clinic_id))))) and public.can_view_clinic_billing(clinic_id));

drop policy if exists payment_reminders_clinic_select on public.payment_reminders;
create policy payment_reminders_clinic_select on public.payment_reminders as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.clinic_id = payment_reminders.clinic_id) AND (p.user_type = ANY (ARRAY['clinic_admin'::text, 'clinic_secretary'::text, 'doctor'::text])))))) and public.can_view_clinic_billing(clinic_id));

-- my_payment_reminder (DEFINER; RLS'i atlar → kural açıkça)
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
$function$
;

-- _send_payment_reminder_core (DEFINER cron): alıcı süzgeci; gönderim ve kanallar aynen
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
END; $function$
;
