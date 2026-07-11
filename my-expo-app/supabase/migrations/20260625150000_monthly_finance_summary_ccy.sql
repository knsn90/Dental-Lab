-- ============================================================
-- 20260625 — Aylık finans özeti PER-CURRENCY
--
-- v_monthly_finance_summary ay başına base toplam veriyor (amount_base ile TL'ye
-- çevirip karıştırıyor). Katı per-currency için: ay + para birimi başına bir satır,
-- gelir/gider ORİJİNAL tutarda; net kâr = gelir − gider (aynı para biriminde).
--
-- Eski view korunur (fallback). get_my_lab_id() WHERE ile lab izolasyonu (eski pattern).
-- Idempotent.
-- ============================================================

CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy AS
SELECT
  month,
  currency,
  SUM(income)  AS income,
  SUM(expense) AS expense,
  SUM(income) - SUM(expense) AS profit
FROM (
  -- Gelir: kesilen faturalar — faturanın KENDİ para biriminde (orijinal total)
  SELECT
    DATE_TRUNC('month', issue_date)::DATE AS month,
    COALESCE(currency, 'TRY')             AS currency,
    total                                 AS income,
    0                                     AS expense
  FROM public.invoices
  WHERE lab_id = get_my_lab_id() AND status <> 'iptal'

  UNION ALL

  -- Gider: tüm expenses — giderin KENDİ para biriminde (orijinal amount)
  SELECT
    DATE_TRUNC('month', expense_date)::DATE AS month,
    COALESCE(currency, 'TRY')              AS currency,
    0                                      AS income,
    amount                                 AS expense
  FROM public.expenses
  WHERE lab_id = get_my_lab_id()
) sub
GROUP BY month, currency
ORDER BY month DESC, currency;

GRANT SELECT ON public.v_monthly_finance_summary_ccy TO authenticated;

-- ============================================================
-- DOĞRULAMA:
--   SELECT month, currency, income, expense, profit
--     FROM v_monthly_finance_summary_ccy ORDER BY month DESC, currency;
-- ============================================================
