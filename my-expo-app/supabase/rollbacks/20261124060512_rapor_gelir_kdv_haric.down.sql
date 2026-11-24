-- GERİ ALMA: 20261124060512_rapor_gelir_kdv_haric → gelir KDV DAHİL (önceki tanım)
-- Karlılık (20261101120000_karlilik_kdv_haric) ile aynı tanım: KDV devlete ait, ciro değil.
-- Gelir = invoices.subtotal; ana para çevrimi = rate_at_time, yoksa amount_base/total, o da yoksa 1.
-- Ekstre indirimi önceki gibi tamamı düşer. Gider değişmez (expenses, gider günü kuru).
-- Kullanan: yalnız modules/finance/screens/FinanceReportScreen.tsx. Geri alma: rollbacks/…down.sql

CREATE OR REPLACE VIEW public.v_monthly_finance_summary WITH (security_invoker = on) AS
 SELECT month,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit
   FROM ( SELECT date_trunc('month'::text, i.issue_date::timestamp with time zone)::date AS month,
            COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric)) AS income,
            0 AS expense
           FROM invoices i
          WHERE i.lab_id = get_my_lab_id() AND (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, e.expense_date::timestamp with time zone)::date AS date_trunc,
            0,
            fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date) AS fn_to_base
           FROM expenses e
          WHERE e.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, d.discount_date::timestamp with time zone)::date AS month,
            - d.amount_base AS income,
            0 AS expense
           FROM v_statement_discount_effective d
          WHERE d.lab_id = get_my_lab_id()) sub
  GROUP BY month
  ORDER BY month DESC;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy WITH (security_invoker = on) AS
 SELECT month,
    currency,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit
   FROM ( SELECT date_trunc('month'::text, invoices.issue_date::timestamp with time zone)::date AS month,
            COALESCE(invoices.currency, 'TRY'::text) AS currency,
            invoices.total AS income,
            0 AS expense
           FROM invoices
          WHERE invoices.lab_id = get_my_lab_id() AND (invoices.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, expenses.expense_date::timestamp with time zone)::date AS month,
            COALESCE(expenses.currency, 'TRY'::text) AS currency,
            0 AS income,
            expenses.amount AS expense
           FROM expenses
          WHERE expenses.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, d.discount_date::timestamp with time zone)::date AS month,
            d.currency,
            - d.amount AS income,
            0 AS expense
           FROM v_statement_discount_effective d
          WHERE d.lab_id = get_my_lab_id()) sub
  GROUP BY month, currency
  ORDER BY month DESC, currency;
