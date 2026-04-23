-- ═══════════════════════════════════════════════════════════════════════════
-- 025 — Çalışan Yönetimi
--   • employees        : Personel kayıtları
--   • salary_payments  : Aylık maaş ödemeleri
--   • employee_advances: Avans kayıtları
--   • v_employee_summary: Personel başına ödenen/kalan maaş özeti
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Çalışanlar tablosu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        NOT NULL DEFAULT get_my_lab_id(),
  full_name       TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'teknisyen'
                  CHECK (role IN ('teknisyen','sef_teknisyen','muhasebe','sekreter','yonetici','diger')),
  phone           TEXT,
  email           TEXT,
  tc_no           TEXT,                          -- TC kimlik (opsiyonel)
  start_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,                          -- Ayrılış tarihi (NULL = aktif)
  base_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_lab_own" ON employees
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_employees_lab
  ON employees (lab_id, is_active);

-- ── 2. Maaş ödemeleri tablosu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        NOT NULL DEFAULT get_my_lab_id(),
  employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_year     INT         NOT NULL,          -- 2026
  period_month    INT         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  gross_amount    NUMERIC(12,2) NOT NULL,        -- Brüt maaş
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- SGK, vergi vb.
  net_amount      NUMERIC(12,2) GENERATED ALWAYS AS (gross_amount - deductions) STORED,
  payment_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT        NOT NULL DEFAULT 'havale'
                  CHECK (payment_method IN ('nakit','havale','kart')),
  notes           TEXT,
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_year, period_month)   -- Ayda bir ödeme
);

ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary_payments_lab_own" ON salary_payments
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_salary_payments_emp
  ON salary_payments (employee_id, period_year DESC, period_month DESC);

-- ── 3. Avans tablosu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_advances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        NOT NULL DEFAULT get_my_lab_id(),
  employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  advance_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT,
  is_deducted     BOOLEAN     NOT NULL DEFAULT false,  -- Maaştan kesildi mi?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_advances_lab_own" ON employee_advances
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_employee_advances_emp
  ON employee_advances (employee_id, advance_date DESC);

-- ── 4. Özet view ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_employee_summary AS
SELECT
  e.id,
  e.lab_id,
  e.full_name,
  e.role,
  e.phone,
  e.base_salary,
  e.is_active,
  e.start_date,
  COALESCE(sp.total_paid, 0)     AS total_salary_paid,
  COALESCE(adv.total_advances, 0) AS total_advances,
  COALESCE(adv.pending_advances, 0) AS pending_advances,
  -- Bu ayki maaş ödendi mi?
  EXISTS (
    SELECT 1 FROM salary_payments sp2
    WHERE sp2.employee_id = e.id
      AND sp2.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::INT
      AND sp2.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::INT
  ) AS current_month_paid
FROM employees e
LEFT JOIN (
  SELECT employee_id, SUM(net_amount) AS total_paid
  FROM salary_payments GROUP BY employee_id
) sp ON sp.employee_id = e.id
LEFT JOIN (
  SELECT employee_id,
         SUM(amount) AS total_advances,
         SUM(CASE WHEN NOT is_deducted THEN amount ELSE 0 END) AS pending_advances
  FROM employee_advances GROUP BY employee_id
) adv ON adv.employee_id = e.id;
