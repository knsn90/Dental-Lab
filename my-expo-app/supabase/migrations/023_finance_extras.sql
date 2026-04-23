-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 023 — Muhasebe Modülü Ek Tablolar & RPC'ler
--
--  • expenses          — gider kaydı (malzeme, kira, personel, ekipman, vergi)
--  • checks            — çek / senet takibi
--  • clinic_discounts  — kliniğe özel indirim oranı
--  • v_upcoming_due_invoices — hatırlatma: 14 gün içinde vadesi dolacak faturalar
--  • v_monthly_finance_summary — aylık gelir / gider / kâr özeti
--  • bulk_record_payment — toplu tahsilat (birden fazla fatura ödeme dağıtımı)
--  • invoices.tax_rate → default 0 (KDV opsiyonel olarak işaretlendi)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Gider tablosu ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id         UUID        NOT NULL DEFAULT get_my_lab_id(),
  category       TEXT        NOT NULL DEFAULT 'diger'
                             CHECK (category IN ('malzeme','kira','personel','ekipman','vergi','diger')),
  description    TEXT        NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT        NOT NULL DEFAULT 'nakit'
                             CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  notes          TEXT,
  created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_lab_own" ON expenses
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_expenses_lab_date
  ON expenses (lab_id, expense_date DESC);

-- ── 2. Çek / Senet takibi ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       UUID        NOT NULL DEFAULT get_my_lab_id(),
  clinic_id    UUID        REFERENCES clinics(id) ON DELETE SET NULL,
  check_number TEXT,
  bank_name    TEXT,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  issue_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date     DATE        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'beklemede'
               CHECK (status IN ('beklemede','tahsil_edildi','iade','iptal')),
  notes        TEXT,
  payment_id   UUID        REFERENCES payments(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checks_lab_own" ON checks
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_checks_lab_due
  ON checks (lab_id, due_date ASC);

-- ── 3. Klinik bazlı indirim ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_discounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID        NOT NULL DEFAULT get_my_lab_id(),
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  discount_rate NUMERIC(5,2) NOT NULL DEFAULT 0
                CHECK (discount_rate >= 0 AND discount_rate <= 100),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lab_id, clinic_id)
);

ALTER TABLE clinic_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_discounts_lab_own" ON clinic_discounts
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ── 4. Hatırlatma view: vadesi yaklaşan faturalar (≤14 gün) ──────────────
CREATE OR REPLACE VIEW v_upcoming_due_invoices AS
SELECT
  i.id,
  i.invoice_number,
  i.due_date,
  (i.total - i.paid_amount)   AS balance,
  c.name                      AS clinic_name,
  (i.due_date - CURRENT_DATE)::INT AS days_until_due
FROM invoices i
LEFT JOIN clinics c ON c.id = i.clinic_id
WHERE i.lab_id = get_my_lab_id()
  AND i.status NOT IN ('odendi','iptal')
  AND i.due_date IS NOT NULL
  AND i.due_date >= CURRENT_DATE
  AND i.due_date <= CURRENT_DATE + INTERVAL '14 days'
ORDER BY i.due_date ASC;

-- ── 5. Aylık gelir / gider / kâr özeti ────────────────────────────────────
CREATE OR REPLACE VIEW v_monthly_finance_summary AS
SELECT
  month,
  SUM(income)  AS income,
  SUM(expense) AS expense,
  SUM(income) - SUM(expense) AS profit
FROM (
  SELECT
    DATE_TRUNC('month', issue_date)::DATE AS month,
    total  AS income,
    0      AS expense
  FROM invoices
  WHERE lab_id = get_my_lab_id() AND status != 'iptal'

  UNION ALL

  SELECT
    DATE_TRUNC('month', expense_date)::DATE AS month,
    0          AS income,
    amount     AS expense
  FROM expenses
  WHERE lab_id = get_my_lab_id()
) sub
GROUP BY month
ORDER BY month DESC;

-- ── 6. Toplu tahsilat RPC ─────────────────────────────────────────────────
-- Seçili faturalara toplam ödemeyi vadesi en eskiden başlayarak dağıtır.
CREATE OR REPLACE FUNCTION bulk_record_payment(
  p_invoice_ids    UUID[],
  p_total_amount   NUMERIC,
  p_payment_method TEXT  DEFAULT 'nakit',
  p_payment_date   DATE  DEFAULT CURRENT_DATE,
  p_notes          TEXT  DEFAULT NULL
) RETURNS TABLE(invoice_id UUID, amount_paid NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row       RECORD;
  v_remaining NUMERIC := p_total_amount;
  v_to_pay    NUMERIC;
  v_lab_id    UUID    := get_my_lab_id();
BEGIN
  FOR v_row IN
    SELECT i.id,
           (i.total - i.paid_amount) AS balance
    FROM invoices i
    WHERE i.id = ANY(p_invoice_ids)
      AND i.lab_id = v_lab_id
      AND i.status NOT IN ('odendi','iptal')
      AND (i.total - i.paid_amount) > 0
    ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_to_pay := LEAST(v_row.balance, v_remaining);

    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes)
    VALUES (v_lab_id, v_row.id, v_to_pay, p_payment_date, p_payment_method, p_notes);

    UPDATE invoices
    SET paid_amount = paid_amount + v_to_pay,
        status = CASE
          WHEN paid_amount + v_to_pay >= total THEN 'odendi'
          WHEN paid_amount + v_to_pay > 0       THEN 'kismi_odendi'
          ELSE status
        END,
        updated_at = now()
    WHERE id = v_row.id;

    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── 7. KDV opsiyonel: tax_rate default 0 ──────────────────────────────────
ALTER TABLE invoices ALTER COLUMN tax_rate SET DEFAULT 0;
