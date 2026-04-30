-- ═════════════════════════════════════════════════════════════════════════
-- 066_budgets.sql
--   Bütçe Modülü (Budget vs. Actual)
--
--   • budgets tablosu — kategori ve dönem bazında bütçe limiti
--   • v_budget_actuals view — bütçeyi gerçekleşen giderle eşleştirir
--
--   Period: 'monthly' | 'yearly'
--   Period_start: ay/yıl başlangıç tarihi (örn. 2026-04-01)
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID NOT NULL DEFAULT get_my_lab_id(),
  category      TEXT NOT NULL CHECK (category IN ('malzeme','kira','personel','ekipman','vergi','diger','total')),
  period        TEXT NOT NULL CHECK (period IN ('monthly','yearly')),
  period_start  DATE NOT NULL,                                 -- ayın 1'i veya yılın 1 Ocak'ı
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes         TEXT,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lab_id, category, period, period_start)              -- aynı dönem-kategori için tek kayıt
);

CREATE INDEX IF NOT EXISTS budgets_lab_period_idx ON budgets(lab_id, period_start);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgets_lab_all ON budgets;
CREATE POLICY budgets_lab_all ON budgets
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Budget vs Actual view ───────────────────────────────────────────────
-- Her bütçe satırı için aynı dönemdeki gerçekleşen gider toplamını döner.
CREATE OR REPLACE VIEW v_budget_actuals AS
SELECT
  b.id,
  b.lab_id,
  b.category,
  b.period,
  b.period_start,
  b.amount                                                       AS budget_amount,
  COALESCE((
    SELECT SUM(e.amount)
      FROM expenses e
     WHERE e.lab_id = b.lab_id
       AND (
         (b.category = 'total')
         OR (e.category = b.category)
       )
       AND e.expense_date >= b.period_start
       AND e.expense_date < (
         CASE b.period
           WHEN 'monthly' THEN (b.period_start + INTERVAL '1 month')::DATE
           WHEN 'yearly'  THEN (b.period_start + INTERVAL '1 year')::DATE
           ELSE (b.period_start + INTERVAL '1 month')::DATE
         END
       )
  ), 0)                                                          AS actual_amount,
  b.notes,
  b.created_at,
  b.updated_at
FROM budgets b;

GRANT SELECT ON v_budget_actuals TO authenticated;
