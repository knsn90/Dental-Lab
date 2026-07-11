-- v_monthly_finance_summary view'ı orijinal currency (amount/total) yerine
-- TL karşılığı (amount_base/total_base) kullanacak şekilde güncellendi.
-- Böylece EUR/USD fatura ve giderler raporda TL ile toplanır — çoklu döviz karışmaz.

CREATE OR REPLACE VIEW public.v_monthly_finance_summary AS
SELECT
  month,
  SUM(income)  AS income,
  SUM(expense) AS expense,
  SUM(income) - SUM(expense) AS profit
FROM (
  -- Gelir: kesilen faturalar — TL karşılığı (amount_base, snapshot kur)
  SELECT
    DATE_TRUNC('month', issue_date)::DATE          AS month,
    COALESCE(amount_base, total)                   AS income,
    0                                              AS expense
  FROM public.invoices
  WHERE lab_id = get_my_lab_id() AND status != 'iptal'

  UNION ALL

  -- Gider: tüm expenses kayıtları — TL karşılığı (amount_base)
  SELECT
    DATE_TRUNC('month', expense_date)::DATE        AS month,
    0                                              AS income,
    COALESCE(amount_base, amount)                  AS expense
  FROM public.expenses
  WHERE lab_id = get_my_lab_id()
) sub
GROUP BY month
ORDER BY month DESC;
