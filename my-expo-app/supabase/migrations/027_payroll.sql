-- ═══════════════════════════════════════════════════════════════════════════
-- 027 — Bordro Modülü
--   • payroll_settings   : Çalışan bazında hesaplama parametreleri
--   • employee_payroll   : Aylık bordro kayıtları
--   • payroll_items      : Ekstra kesinti / prim kalemleri
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bordro hesaplama ayarları ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  id                        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id                    UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  employee_id               UUID  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  working_days_per_month    INT   NOT NULL DEFAULT 22,
  late_penalty_per_incident NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_multiplier       NUMERIC(4,2)  NOT NULL DEFAULT 1.5,

  include_sgk               BOOLEAN NOT NULL DEFAULT false,
  sgk_employee_rate         NUMERIC(5,4)  NOT NULL DEFAULT 0.14,    -- %14 çalışan
  sgk_employer_rate         NUMERIC(5,4)  NOT NULL DEFAULT 0.205,   -- %20.5 işveren

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id)
);

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_settings_lab_own" ON payroll_settings
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ── 2. Aylık bordro kaydı ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_payroll (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  employee_id UUID  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period      TEXT  NOT NULL,  -- 'YYYY-MM'

  -- Temel bilgiler
  base_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  working_days_month   INT           NOT NULL DEFAULT 22,

  -- Devam verisinden alınan
  actual_work_days     INT           NOT NULL DEFAULT 0,
  absent_days          INT           NOT NULL DEFAULT 0,
  late_count           INT           NOT NULL DEFAULT 0,
  leave_days           INT           NOT NULL DEFAULT 0,
  overtime_minutes     INT           NOT NULL DEFAULT 0,

  -- Hesaplanan kesintiler
  absence_deduction    NUMERIC(12,2) NOT NULL DEFAULT 0,
  late_deduction       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgk_employee         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgk_employer         NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Hesaplanan primler
  overtime_bonus       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Toplamlar
  total_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_bonuses        NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_salary         NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary           NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Durum
  status      TEXT NOT NULL DEFAULT 'taslak'
              CHECK (status IN ('taslak','onaylandi','odendi')),
  notes       TEXT,
  paid_at     DATE,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, period)
);

ALTER TABLE employee_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_payroll_lab_own" ON employee_payroll
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_employee_payroll_period
  ON employee_payroll (lab_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_emp
  ON employee_payroll (employee_id, period DESC);

-- ── 3. Ekstra kalemler (özel kesinti / prim) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  payroll_id  UUID  NOT NULL REFERENCES employee_payroll(id) ON DELETE CASCADE,
  type        TEXT  NOT NULL CHECK (type IN ('kesinti','prim','avans','diger')),
  description TEXT  NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_items_lab_own" ON payroll_items
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ── 4. Otomatik hesaplama fonksiyonu ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_payroll_from_attendance(
  p_employee_id UUID,
  p_period      TEXT   -- 'YYYY-MM'
)
RETURNS employee_payroll
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp       RECORD;
  v_settings  RECORD;
  v_att       RECORD;
  v_daily     NUMERIC;
  v_hourly    NUMERIC;
  v_ot_hours  NUMERIC;
  v_result    employee_payroll%ROWTYPE;
BEGIN
  -- Çalışan bilgisi
  SELECT e.id, e.lab_id, e.base_salary
  INTO v_emp
  FROM employees e
  WHERE e.id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışan bulunamadı: %', p_employee_id;
  END IF;

  -- Ayarlar (yoksa default)
  SELECT
    COALESCE(ps.working_days_per_month, 22)   AS wdm,
    COALESCE(ps.late_penalty_per_incident, 0) AS late_pen,
    COALESCE(ps.overtime_multiplier, 1.5)     AS ot_mult,
    COALESCE(ps.include_sgk, false)           AS incl_sgk,
    COALESCE(ps.sgk_employee_rate, 0.14)      AS sgk_emp_r,
    COALESCE(ps.sgk_employer_rate, 0.205)     AS sgk_er_r
  INTO v_settings
  FROM (SELECT NULL) dummy
  LEFT JOIN payroll_settings ps ON ps.employee_id = p_employee_id;

  -- Devam verisi
  SELECT
    COUNT(*) FILTER (WHERE a.status NOT IN ('resmi_tatil'))            AS total_rec,
    COUNT(*) FILTER (WHERE a.status = 'devamsiz')                      AS absent_d,
    COUNT(*) FILTER (WHERE a.status = 'gec')                           AS late_c,
    COUNT(*) FILTER (WHERE a.status IN ('izinli','hastalik'))          AS leave_d,
    COALESCE(SUM(a.overtime_minutes), 0)                               AS ot_min
  INTO v_att
  FROM employee_attendance a
  WHERE a.employee_id = p_employee_id
    AND to_char(a.work_date, 'YYYY-MM') = p_period;

  -- Günlük / saatlik ücret
  v_daily   := v_emp.base_salary / GREATEST(v_settings.wdm, 1);
  v_hourly  := v_daily / 8.0;
  v_ot_hours := COALESCE(v_att.ot_min, 0)::NUMERIC / 60.0;

  -- Bordroyu upsert et
  INSERT INTO employee_payroll (
    lab_id, employee_id, period,
    base_salary, working_days_month,
    actual_work_days, absent_days, late_count, leave_days, overtime_minutes,
    absence_deduction, late_deduction, overtime_bonus,
    sgk_employee, sgk_employer,
    total_deductions, total_bonuses, gross_salary, net_salary,
    status, updated_at
  )
  VALUES (
    v_emp.lab_id, p_employee_id, p_period,
    v_emp.base_salary, v_settings.wdm,
    COALESCE(v_att.total_rec, 0), COALESCE(v_att.absent_d, 0),
    COALESCE(v_att.late_c, 0),   COALESCE(v_att.leave_d, 0),
    COALESCE(v_att.ot_min, 0),
    ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2),
    ROUND(COALESCE(v_att.late_c, 0)   * v_settings.late_pen, 2),
    ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2),
    CASE WHEN v_settings.incl_sgk
         THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END,
    CASE WHEN v_settings.incl_sgk
         THEN ROUND(v_emp.base_salary * v_settings.sgk_er_r, 2) ELSE 0 END,
    -- total_deductions
    ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2)
      + ROUND(COALESCE(v_att.late_c, 0) * v_settings.late_pen, 2)
      + CASE WHEN v_settings.incl_sgk
             THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END,
    -- total_bonuses
    ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2),
    -- gross_salary
    v_emp.base_salary,
    -- net_salary
    GREATEST(0,
      v_emp.base_salary
      - (ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2)
         + ROUND(COALESCE(v_att.late_c, 0) * v_settings.late_pen, 2)
         + CASE WHEN v_settings.incl_sgk
                THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END)
      + ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2)
    ),
    'taslak',
    now()
  )
  ON CONFLICT (employee_id, period) DO UPDATE
    SET
      base_salary          = EXCLUDED.base_salary,
      working_days_month   = EXCLUDED.working_days_month,
      actual_work_days     = EXCLUDED.actual_work_days,
      absent_days          = EXCLUDED.absent_days,
      late_count           = EXCLUDED.late_count,
      leave_days           = EXCLUDED.leave_days,
      overtime_minutes     = EXCLUDED.overtime_minutes,
      absence_deduction    = EXCLUDED.absence_deduction,
      late_deduction       = EXCLUDED.late_deduction,
      overtime_bonus       = EXCLUDED.overtime_bonus,
      sgk_employee         = EXCLUDED.sgk_employee,
      sgk_employer         = EXCLUDED.sgk_employer,
      total_deductions     = EXCLUDED.total_deductions,
      total_bonuses        = EXCLUDED.total_bonuses,
      gross_salary         = EXCLUDED.gross_salary,
      net_salary           = EXCLUDED.net_salary,
      updated_at           = now()
    WHERE employee_payroll.status = 'taslak'  -- onaylandıysa değiştirme
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 5. Özet view ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_payroll_summary AS
SELECT
  ep.id,
  ep.lab_id,
  ep.employee_id,
  ep.period,
  e.full_name,
  e.role,
  ep.base_salary,
  ep.absent_days,
  ep.late_count,
  ep.overtime_minutes,
  ep.total_deductions,
  ep.total_bonuses,
  ep.net_salary,
  ep.status,
  ep.paid_at,
  ep.approved_at,
  -- custom items toplamı
  COALESCE((
    SELECT SUM(CASE WHEN pi.type IN ('kesinti','avans') THEN -pi.amount ELSE pi.amount END)
    FROM payroll_items pi WHERE pi.payroll_id = ep.id
  ), 0) AS custom_items_net,
  ep.created_at,
  ep.updated_at
FROM employee_payroll ep
JOIN employees e ON e.id = ep.employee_id;
