-- 20261026140000_rapor_tek_tanim.sql
-- Tek tanım (Y2) Task 11:
--  * v_monthly_finance_summary: birleşik (ana para birimi) ciro faturanın SAKLI kuruyla
--    (amount_base / total × rate_at_time; v_clinic_balance ile aynı formül). Eskiden fatura tarihindeki
--    kur tablosu (fn_to_base) kullanılıyordu. Gider tarafı değişmedi.
--  * v_upcoming_due_invoices (Rapor "Hatırlatma"): taslak faturalar alacak değil → hariç; bugün = lab günü.
-- Geri alma: rollbacks/20261026140000_rapor_tek_tanim.down.sql

create or replace view public.v_monthly_finance_summary with (security_invoker = on) as
SELECT month,
    sum(income) AS income,
    sum(expense) AS expense,
    (sum(income) - sum(expense)) AS profit
   FROM ( SELECT (date_trunc('month'::text, (i.issue_date)::timestamp with time zone))::date AS month,
            COALESCE(i.amount_base, (i.total * COALESCE(i.rate_at_time, (1)::numeric))) AS income,
            0 AS expense
           FROM invoices i
          WHERE ((i.lab_id = get_my_lab_id()) AND (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])))
        UNION ALL
         SELECT (date_trunc('month'::text, (e.expense_date)::timestamp with time zone))::date AS date_trunc,
            0,
            fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date) AS fn_to_base
           FROM expenses e
          WHERE (e.lab_id = get_my_lab_id())) sub
  GROUP BY month
  ORDER BY month DESC;

create or replace view public.v_upcoming_due_invoices with (security_invoker = on) as
SELECT i.id,
    i.invoice_number,
    i.due_date,
    (i.total - i.paid_amount) AS balance,
    c.name AS clinic_name,
    (i.due_date - public.lab_today(i.lab_id)) AS days_until_due,
    COALESCE(i.currency, 'TRY'::text) AS currency
   FROM (invoices i
     LEFT JOIN clinics c ON ((c.id = i.clinic_id)))
  WHERE ((i.lab_id = get_my_lab_id()) AND (i.status <> ALL (ARRAY['odendi'::text, 'iptal'::text, 'taslak'::text])) AND (i.due_date IS NOT NULL) AND (i.due_date >= public.lab_today(i.lab_id)) AND (i.due_date <= (public.lab_today(i.lab_id) + '14 days'::interval)))
  ORDER BY i.due_date;
