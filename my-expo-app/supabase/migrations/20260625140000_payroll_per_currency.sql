-- ============================================================
-- 20260625 — Bordro (maaş & avans) PER-CURRENCY
--
-- AMAÇ (katı per-currency):
--   • employee_advances tablosunda currency yok → eklenir (snapshot kolonları).
--   • v_employee_summary maaş/avansı tek toplama indiriyor (SUM net_amount /
--     SUM amount). Para birimine göre BAĞIMSIZ toplam için iki yeni view.
--
-- salary_payments zaten currency/rate_at_time/amount_base taşıyor (finance_currency).
-- security_invoker = true → RLS uygulanır (lab izolasyonu).
-- Idempotent.
-- ============================================================

-- ── 1. employee_advances: per-currency snapshot kolonları ──────
ALTER TABLE public.employee_advances
  ADD COLUMN IF NOT EXISTS currency     text          NOT NULL DEFAULT 'TRY'
    CHECK (currency IN ('TRY','EUR','USD','GBP')),
  ADD COLUMN IF NOT EXISTS rate_at_time numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_base  numeric(14,2);

UPDATE public.employee_advances
   SET amount_base = COALESCE(amount_base, amount)
 WHERE amount_base IS NULL;

-- ── 2. Maaş — çalışan + para birimi başına bağımsız toplam ─────
CREATE OR REPLACE VIEW public.v_employee_salary_ccy
WITH (security_invoker = true) AS
 SELECT employee_id,
        lab_id,
        COALESCE(currency, 'TRY') AS currency,
        SUM(net_amount)   AS total_net,
        SUM(gross_amount) AS total_gross,
        count(*)          AS payment_count
   FROM public.salary_payments
  GROUP BY employee_id, lab_id, COALESCE(currency, 'TRY');

-- ── 3. Avans — çalışan + para birimi başına bağımsız toplam ────
CREATE OR REPLACE VIEW public.v_employee_advances_ccy
WITH (security_invoker = true) AS
 SELECT employee_id,
        lab_id,
        COALESCE(currency, 'TRY') AS currency,
        SUM(amount) AS total_advances,
        SUM(CASE WHEN NOT is_deducted THEN amount ELSE 0 END) AS pending_advances,
        count(*) AS advance_count
   FROM public.employee_advances
  GROUP BY employee_id, lab_id, COALESCE(currency, 'TRY');

GRANT SELECT ON public.v_employee_salary_ccy   TO authenticated;
GRANT SELECT ON public.v_employee_advances_ccy TO authenticated;

-- ============================================================
-- DOĞRULAMA:
--   SELECT employee_id, currency, total_net FROM v_employee_salary_ccy;
--   SELECT employee_id, currency, total_advances, pending_advances FROM v_employee_advances_ccy;
-- ============================================================
