-- 20261026100000_tek_tanim_katmani.sql
-- Tek tanım (2. dalga 2, Y2) — tanım katmanı. Spec: docs/superpowers/specs/2026-10-26-tek-tanim-design.md §4
--  * lab_tz / lab_today: "bugün" lab'ın kendi saat diliminde (labs.timezone, boşsa Europe/Istanbul).
--    Veritabanı UTC; CURRENT_DATE TR'de 00:00–03:00 arası dünü veriyordu.
--  * wo_is_open / wo_is_overdue: sipariş yüklemleri (istemci aynası core/metrics/orderDefs.ts).
--  * order_metrics(): Özet ve liste sayıları; INVOKER (teknisyen yalnız kendi işini sayar), kendi lab'ı.
--  * finance_period_metrics(from,to): ciro (kesilmiş fatura, issue_date) + tahsilat (makbuz günü +
--    makbuzsuz ödeme); finans yetkisi yoksa boş.
--  * lab_receivables_summary(): lab alacağı (pozitif bakiyeler), vadesi geçmiş (avans düşülmüş), taslak.
--  * v_clinic_balance(_ccy): CURRENT_DATE → lab_today(i.lab_id); sona overdue_net = vadesi geçmiş − avans (≥0).
-- Geri alma: rollbacks/20261026100000_tek_tanim_katmani.down.sql

create or replace function public.lab_tz(p_lab uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(l.timezone), '') from public.labs l
                    where l.id = coalesce(p_lab, public.get_my_lab_id())), 'Europe/Istanbul')
$$;

create or replace function public.lab_today(p_lab uuid default null, p_at timestamptz default now())
returns date language sql stable security definer set search_path = public as $$
  select (p_at at time zone public.lab_tz(p_lab))::date
$$;

create or replace function public.wo_is_open(p_status text, p_archived boolean)
returns boolean language sql immutable as $$
  select p_status not in ('teslim_edildi', 'iptal') and not coalesce(p_archived, false)
$$;

create or replace function public.wo_is_overdue(p_status text, p_archived boolean, p_hold text, p_delivery date, p_today date)
returns boolean language sql immutable as $$
  select public.wo_is_open(p_status, p_archived)
     and p_hold is distinct from 'on_hold'
     and p_delivery is not null and p_delivery < p_today
$$;

create or replace function public.order_metrics(p_at timestamptz default now())
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select public.lab_today(public.get_my_lab_id(), p_at) as d, public.lab_tz(public.get_my_lab_id()) as tz
  ), w0 as (
    select w.status::text as st, w.is_archived, w.hold_status, w.delivery_date, w.is_urgent,
           w.created_at, w.delivered_at, w.revision_of_id, w.continues_order_id
      from public.work_orders w
     where w.lab_id = public.get_my_lab_id()
  )
  select jsonb_build_object(
    'today',              to_char(t.d, 'YYYY-MM-DD'),
    'active',             count(*) filter (where public.wo_is_open(w0.st, w0.is_archived)),
    'overdue',            count(*) filter (where public.wo_is_overdue(w0.st, w0.is_archived, w0.hold_status, w0.delivery_date, t.d)),
    'urgent',             count(*) filter (where public.wo_is_open(w0.st, w0.is_archived) and coalesce(w0.is_urgent, false)),
    'due_today',          count(*) filter (where public.wo_is_open(w0.st, w0.is_archived) and w0.delivery_date = t.d),
    'due_tomorrow',       count(*) filter (where public.wo_is_open(w0.st, w0.is_archived) and w0.delivery_date = t.d + 1),
    'created_today',      count(*) filter (where w0.st <> 'iptal' and w0.revision_of_id is null and w0.continues_order_id is null
                                             and (w0.created_at at time zone t.tz)::date = t.d),
    'created_this_month', count(*) filter (where w0.st <> 'iptal' and w0.revision_of_id is null and w0.continues_order_id is null
                                             and date_trunc('month', w0.created_at at time zone t.tz) = date_trunc('month', t.d::timestamp)),
    'delivered_today',    count(*) filter (where (w0.delivered_at at time zone t.tz)::date = t.d),
    'by_status',          coalesce((select jsonb_object_agg(s.st, s.n) from (
                             select x.st, count(*) as n from w0 x where not coalesce(x.is_archived, false) group by x.st) s), '{}'::jsonb)
  )
  from t left join w0 on true
  group by t.d, t.tz
$$;

create or replace function public.finance_period_metrics(p_from date, p_to date)
returns table(currency text, revenue numeric, invoice_count int, collections numeric)
language sql stable security invoker set search_path = public as $$
  with lab as (
    select public.get_my_lab_id() as id where public.lab_can_view_finance()
  ), rev as (
    select coalesce(i.currency, 'TRY') as ccy, sum(i.total) as amt, count(*)::int as n
      from public.invoices i join lab on i.lab_id = lab.id
     where i.status in ('kesildi', 'kismi_odendi', 'odendi') and i.issue_date between p_from and p_to
     group by 1
  ), col as (
    select x.ccy, sum(x.amt) as amt from (
      -- makbuz satırları, makbuz gününde
      select coalesce(l.currency, r.base_currency, 'TRY') as ccy, l.amount as amt
        from public.clinic_receipt_lines l
        join public.clinic_receipts r on r.id = l.receipt_id
        join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
      union all
      -- satırı olmayan makbuz: ana para biriminde toplam
      select coalesce(r.base_currency, 'TRY'), r.total_base
        from public.clinic_receipts r join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
         and not exists (select 1 from public.clinic_receipt_lines l where l.receipt_id = r.id)
      union all
      -- makbuza bağlı olmayan doğrudan ödemeler (makbuzdan dağıtılan ödemeler zaten makbuzda sayıldı)
      select coalesce(p.currency, 'TRY'), p.amount
        from public.payments p join lab on p.lab_id = lab.id
       where p.receipt_id is null and p.payment_date between p_from and p_to
    ) x group by x.ccy
  )
  select coalesce(rev.ccy, col.ccy), coalesce(rev.amt, 0), coalesce(rev.n, 0), coalesce(col.amt, 0)
    from rev full join col on col.ccy = rev.ccy
$$;

revoke all on function public.order_metrics(timestamptz) from public, anon;
grant execute on function public.order_metrics(timestamptz) to authenticated;
revoke all on function public.finance_period_metrics(date, date) from public, anon;
grant execute on function public.finance_period_metrics(date, date) to authenticated;
revoke all on function public.lab_tz(uuid) from public, anon;
grant execute on function public.lab_tz(uuid) to authenticated;
revoke all on function public.lab_today(uuid, timestamptz) from public, anon;
grant execute on function public.lab_today(uuid, timestamptz) to authenticated;

create or replace view public.v_clinic_balance with (security_invoker = true) as
SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, (i.total * COALESCE(i.rate_at_time, (1)::numeric)))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum((i.paid_amount * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    (COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric)) AS balance,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= public.lab_today(i.lab_id))))), (0)::numeric) AS aging_current,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) >= 1) AND ((public.lab_today(i.lab_id) - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) >= 31) AND ((public.lab_today(i.lab_id) - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
        CASE
            WHEN (count(DISTINCT i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))) = 1) THEN max(i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency <> 'TRY'::text)))
            ELSE NULL::text
        END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_paid_original,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS balance_original,
    COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric) AS unallocated_credit,
    GREATEST((0)::numeric, (COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric)) - (COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric))) AS overdue_net
   FROM (clinics c
     LEFT JOIN invoices i ON ((i.clinic_id = c.id)))
  GROUP BY c.id, c.name, i.lab_id;

create or replace view public.v_clinic_balance_ccy with (security_invoker = true) as
SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    (COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(cr.credit, (0)::numeric)) AS balance,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= public.lab_today(i.lab_id))))), (0)::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) >= 1) AND ((public.lab_today(i.lab_id) - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) >= 31) AND ((public.lab_today(i.lab_id) - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((public.lab_today(i.lab_id) - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
    COALESCE(cr.credit, (0)::numeric) AS unallocated_credit,
    GREATEST((0)::numeric, (COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < public.lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric)) - (COALESCE(cr.credit, (0)::numeric))) AS overdue_net
   FROM ((clinics c
     JOIN invoices i ON ((i.clinic_id = c.id)))
     LEFT JOIN ( SELECT r.clinic_id,
            r.base_currency,
            sum((r.total_base - r.allocated_base)) AS credit
           FROM clinic_receipts r
          GROUP BY r.clinic_id, r.base_currency) cr ON (((cr.clinic_id = c.id) AND (cr.base_currency = COALESCE(i.currency, 'TRY'::text)))))
  GROUP BY c.id, c.name, i.lab_id, COALESCE(i.currency, 'TRY'::text), cr.credit;

create or replace function public.lab_receivables_summary()
returns table(currency text, receivable numeric, overdue numeric, overdue_clinics int, credit_surplus numeric, draft_total numeric, draft_count int)
language sql stable security invoker set search_path = public as $$
  with lab as (
    select public.get_my_lab_id() as id where public.lab_can_view_finance()
  ), b as (
    select v.currency, v.clinic_id, v.balance, v.overdue_net
      from public.v_clinic_balance_ccy v join lab on v.lab_id = lab.id
  ), agg as (
    select b.currency, sum(greatest(b.balance, 0)) as receivable, sum(b.overdue_net) as overdue,
           (count(distinct b.clinic_id) filter (where b.overdue_net > 0))::int as oc,
           sum(greatest(-b.balance, 0)) as credit_surplus
      from b group by b.currency
  ), dr as (
    select coalesce(i.currency, 'TRY') as ccy, sum(i.total) as t, count(*)::int as n
      from public.invoices i join lab on i.lab_id = lab.id
     where i.status = 'taslak' group by 1
  )
  select coalesce(agg.currency, dr.ccy), coalesce(agg.receivable, 0), coalesce(agg.overdue, 0), coalesce(agg.oc, 0),
         coalesce(agg.credit_surplus, 0), coalesce(dr.t, 0), coalesce(dr.n, 0)
    from agg full join dr on dr.ccy = agg.currency
$$;

revoke all on function public.lab_receivables_summary() from public, anon;
grant execute on function public.lab_receivables_summary() to authenticated;
