-- Geri alma: 20261026100000_tek_tanim_katmani (canlı tanımlar .before.txt'ten, 2026-10-26)
drop function if exists public.lab_receivables_summary();
drop function if exists public.finance_period_metrics(date, date);
drop function if exists public.order_metrics(timestamptz);
drop function if exists public.wo_is_overdue(text, boolean, text, date, date);
drop function if exists public.wo_is_open(text, boolean);

drop view if exists public.v_clinic_balance;
create view public.v_clinic_balance with (security_invoker = true) as
SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, (i.total * COALESCE(i.rate_at_time, (1)::numeric)))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum((i.paid_amount * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    (COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric)) AS balance,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < CURRENT_DATE) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= CURRENT_DATE)))), (0)::numeric) AS aging_current,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) >= 1) AND ((CURRENT_DATE - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) >= 31) AND ((CURRENT_DATE - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < CURRENT_DATE) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
        CASE
            WHEN (count(DISTINCT i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))) = 1) THEN max(i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency <> 'TRY'::text)))
            ELSE NULL::text
        END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_paid_original,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS balance_original,
    COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric) AS unallocated_credit
   FROM (clinics c
     LEFT JOIN invoices i ON ((i.clinic_id = c.id)))
  GROUP BY c.id, c.name, i.lab_id;
grant select, references, trigger, maintain on public.v_clinic_balance to authenticated;
grant maintain on public.v_clinic_balance to anon;
grant all on public.v_clinic_balance to service_role;

drop view if exists public.v_clinic_balance_ccy;
create view public.v_clinic_balance_ccy with (security_invoker = true) as
SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    (COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(cr.credit, (0)::numeric)) AS balance,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < CURRENT_DATE) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= CURRENT_DATE)))), (0)::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) >= 1) AND ((CURRENT_DATE - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) >= 31) AND ((CURRENT_DATE - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((CURRENT_DATE - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < CURRENT_DATE) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
    COALESCE(cr.credit, (0)::numeric) AS unallocated_credit
   FROM ((clinics c
     JOIN invoices i ON ((i.clinic_id = c.id)))
     LEFT JOIN ( SELECT r.clinic_id,
            r.base_currency,
            sum((r.total_base - r.allocated_base)) AS credit
           FROM clinic_receipts r
          GROUP BY r.clinic_id, r.base_currency) cr ON (((cr.clinic_id = c.id) AND (cr.base_currency = COALESCE(i.currency, 'TRY'::text)))))
  GROUP BY c.id, c.name, i.lab_id, COALESCE(i.currency, 'TRY'::text), cr.credit;
grant select, references, trigger, maintain on public.v_clinic_balance_ccy to authenticated;
grant maintain on public.v_clinic_balance_ccy to anon;
grant all on public.v_clinic_balance_ccy to service_role;

drop function if exists public.lab_today(uuid, timestamptz);
drop function if exists public.lab_tz(uuid);
