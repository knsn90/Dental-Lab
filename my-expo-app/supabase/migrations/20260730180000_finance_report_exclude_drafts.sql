-- ============================================================
-- 20260730 — Aylık finans özeti view'larından TASLAK faturaları çıkar
--
-- Sorun: Finans → Rapor "Toplam Gelir"e taslak (kesilmemiş) faturalar da giriyordu
-- (view filtresi yalnız status<>'iptal' idi). Taslak = henüz kesilmemiş → gelir değildir.
--
-- Çözüm: gelir tarafında status NOT IN ('iptal','taslak'). Gider tarafı aynen kalır.
-- Kolonlar/şekil değişmiyor → CREATE OR REPLACE VIEW (DROP yok). reloptions (security)
-- zaten null; korunur.
-- ============================================================

CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy AS
 SELECT month, currency, sum(income) AS income, sum(expense) AS expense, sum(income)-sum(expense) AS profit
 FROM (
   SELECT date_trunc('month', invoices.issue_date::timestamptz)::date AS month,
          COALESCE(invoices.currency,'TRY') AS currency, invoices.total AS income, 0 AS expense
   FROM invoices
   WHERE invoices.lab_id = get_my_lab_id() AND invoices.status NOT IN ('iptal','taslak')
   UNION ALL
   SELECT date_trunc('month', expenses.expense_date::timestamptz)::date AS month,
          COALESCE(expenses.currency,'TRY') AS currency, 0 AS income, expenses.amount AS expense
   FROM expenses WHERE expenses.lab_id = get_my_lab_id()
 ) sub
 GROUP BY month, currency
 ORDER BY month DESC, currency;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary AS
 SELECT month, sum(income) AS income, sum(expense) AS expense, sum(income)-sum(expense) AS profit
 FROM (
   SELECT date_trunc('month', invoices.issue_date::timestamptz)::date AS month,
          COALESCE(invoices.amount_base, invoices.total) AS income, 0 AS expense
   FROM invoices
   WHERE invoices.lab_id = get_my_lab_id() AND invoices.status NOT IN ('iptal','taslak')
   UNION ALL
   SELECT date_trunc('month', expenses.expense_date::timestamptz)::date AS month,
          0 AS income, COALESCE(expenses.amount_base, expenses.amount) AS expense
   FROM expenses WHERE expenses.lab_id = get_my_lab_id()
 ) sub
 GROUP BY month
 ORDER BY month DESC;
