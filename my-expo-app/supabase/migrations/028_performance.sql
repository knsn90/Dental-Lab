-- ═══════════════════════════════════════════════════════════════════════════
-- 028 — Performans & Prim Modülü
--   • performance_rules    : Prim hesaplama kuralları
--   • employee_performance : Aylık performans özeti (sipariş verisinden)
--   • performance_bonuses  : Hesaplanan prim kayıtları
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Prim kuralları ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_rules (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,

  name        TEXT  NOT NULL,          -- "Teslim Primi", "Kalite Primi" vs.
  description TEXT,

  -- Hangi metriğe göre tetiklenir
  metric      TEXT  NOT NULL CHECK (metric IN (
    'orders_completed',    -- Tamamlanan sipariş sayısı
    'on_time_rate',        -- Zamanında teslim oranı (%)
    'quality_pass_rate',   -- Kalite geçiş oranı (%)
    'revenue_generated'    -- Üretilen ciro (₺)
  )),

  -- Eşik değeri
  threshold_value  NUMERIC(12,2) NOT NULL,  -- örn. 20 sipariş, 90%, 50000₺
  threshold_type   TEXT NOT NULL CHECK (threshold_type IN ('min','target','per_unit')),
  -- min       = threshold_value'a ulaşınca prim al
  -- target    = threshold_value üzerinde kalan her birim için prim
  -- per_unit  = her birim için sabit miktar

  -- Prim miktarı
  bonus_type   TEXT NOT NULL CHECK (bonus_type IN ('fixed','percent','per_unit')),
  bonus_amount NUMERIC(12,2) NOT NULL,  -- ₺ veya %
  -- fixed    = sabit tutar
  -- percent  = baz maaşın yüzdesi
  -- per_unit = her sipariş/unit başına ₺

  -- Geçerlilik
  applies_to   TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN (
    'all','role_teknisyen','role_sef_teknisyen','role_muhasebe','role_sekreter'
  )),

  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE performance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_rules_lab_own" ON performance_rules
  USING (lab_id = get_my_lab_id()) WITH CHECK (lab_id = get_my_lab_id());

-- ── 2. Aylık performans özeti ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_performance (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  employee_id     UUID  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period          TEXT  NOT NULL,   -- 'YYYY-MM'

  -- Sipariş metrikleri (orders tablosundan hesaplanır)
  orders_assigned    INT  NOT NULL DEFAULT 0,
  orders_completed   INT  NOT NULL DEFAULT 0,
  orders_on_time     INT  NOT NULL DEFAULT 0,
  orders_late        INT  NOT NULL DEFAULT 0,
  orders_quality_ok  INT  NOT NULL DEFAULT 0,

  -- Hesaplanmış oranlar
  completion_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- %
  on_time_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- %
  quality_pass_rate  NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- %

  -- Ciro
  revenue_generated  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Performans skoru (0-100)
  score              NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- Durum
  is_locked          BOOLEAN NOT NULL DEFAULT false,  -- true = yönetici onayladı

  notes     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, period)
);

ALTER TABLE employee_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_perf_lab_own" ON employee_performance
  USING (lab_id = get_my_lab_id()) WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_emp_perf_period
  ON employee_performance (lab_id, period DESC);

-- ── 3. Prim kayıtları ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_bonuses (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  performance_id  UUID  NOT NULL REFERENCES employee_performance(id) ON DELETE CASCADE,
  rule_id         UUID  REFERENCES performance_rules(id) ON DELETE SET NULL,

  description     TEXT  NOT NULL,
  metric_value    NUMERIC(12,2) NOT NULL,  -- gerçekleşen değer
  bonus_amount    NUMERIC(12,2) NOT NULL,  -- hesaplanan prim tutarı

  -- Bordroya aktarıldı mı?
  transferred_to_payroll  BOOLEAN NOT NULL DEFAULT false,
  payroll_id              UUID REFERENCES employee_payroll(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE performance_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_bonuses_lab_own" ON performance_bonuses
  USING (lab_id = get_my_lab_id()) WITH CHECK (lab_id = get_my_lab_id());

-- ── 4. Sipariş verisinden performans hesaplama fonksiyonu ─────────────────────
CREATE OR REPLACE FUNCTION calculate_employee_performance(
  p_employee_id UUID,
  p_period      TEXT   -- 'YYYY-MM'
)
RETURNS employee_performance
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp      RECORD;
  v_metrics  RECORD;
  v_score    NUMERIC;
  v_result   employee_performance%ROWTYPE;
BEGIN
  SELECT id, lab_id FROM employees WHERE id = p_employee_id INTO v_emp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Çalışan bulunamadı: %', p_employee_id; END IF;

  -- Sipariş metrikleri (assigned_to alanından)
  SELECT
    COUNT(*)                                                             AS assigned,
    COUNT(*) FILTER (WHERE status IN ('teslim','teslim_edildi'))         AS completed,
    COUNT(*) FILTER (
      WHERE status IN ('teslim','teslim_edildi')
        AND (delivery_date IS NULL OR updated_at::date <= delivery_date)
    )                                                                    AS on_time,
    COUNT(*) FILTER (
      WHERE status IN ('teslim','teslim_edildi')
        AND delivery_date IS NOT NULL AND updated_at::date > delivery_date
    )                                                                    AS late_count,
    COUNT(*) FILTER (WHERE status IN ('teslim','teslim_edildi'))         AS quality_ok,
    COALESCE(SUM(total_price), 0)                                        AS revenue
  INTO v_metrics
  FROM orders
  WHERE assigned_to = p_employee_id
    AND to_char(created_at, 'YYYY-MM') = p_period;

  -- Performans skoru (ağırlıklı ortalama)
  -- %40 tamamlama oranı + %40 zamanında teslim + %20 kalite
  DECLARE
    v_comp_rate NUMERIC := CASE WHEN v_metrics.assigned > 0
      THEN (v_metrics.completed::NUMERIC / v_metrics.assigned) * 100 ELSE 0 END;
    v_time_rate NUMERIC := CASE WHEN v_metrics.completed > 0
      THEN (v_metrics.on_time::NUMERIC / v_metrics.completed) * 100 ELSE 0 END;
    v_qual_rate NUMERIC := CASE WHEN v_metrics.completed > 0
      THEN (v_metrics.quality_ok::NUMERIC / v_metrics.completed) * 100 ELSE 100 END;
  BEGIN
    v_score := (v_comp_rate * 0.4) + (v_time_rate * 0.4) + (v_qual_rate * 0.2);
  END;

  -- Upsert
  INSERT INTO employee_performance (
    lab_id, employee_id, period,
    orders_assigned, orders_completed, orders_on_time, orders_late, orders_quality_ok,
    completion_rate, on_time_rate, quality_pass_rate, revenue_generated, score,
    updated_at
  )
  VALUES (
    v_emp.lab_id, p_employee_id, p_period,
    COALESCE(v_metrics.assigned, 0),
    COALESCE(v_metrics.completed, 0),
    COALESCE(v_metrics.on_time, 0),
    COALESCE(v_metrics.late_count, 0),
    COALESCE(v_metrics.quality_ok, 0),
    CASE WHEN v_metrics.assigned > 0
         THEN ROUND((v_metrics.completed::NUMERIC / v_metrics.assigned) * 100, 1) ELSE 0 END,
    CASE WHEN v_metrics.completed > 0
         THEN ROUND((v_metrics.on_time::NUMERIC / v_metrics.completed) * 100, 1) ELSE 0 END,
    CASE WHEN v_metrics.completed > 0
         THEN ROUND((v_metrics.quality_ok::NUMERIC / v_metrics.completed) * 100, 1) ELSE 100 END,
    COALESCE(v_metrics.revenue, 0),
    ROUND(v_score, 1),
    now()
  )
  ON CONFLICT (employee_id, period) DO UPDATE
    SET
      orders_assigned    = EXCLUDED.orders_assigned,
      orders_completed   = EXCLUDED.orders_completed,
      orders_on_time     = EXCLUDED.orders_on_time,
      orders_late        = EXCLUDED.orders_late,
      orders_quality_ok  = EXCLUDED.orders_quality_ok,
      completion_rate    = EXCLUDED.completion_rate,
      on_time_rate       = EXCLUDED.on_time_rate,
      quality_pass_rate  = EXCLUDED.quality_pass_rate,
      revenue_generated  = EXCLUDED.revenue_generated,
      score              = EXCLUDED.score,
      updated_at         = now()
    WHERE employee_performance.is_locked = false
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 5. Prim hesaplama fonksiyonu ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_performance_bonuses(
  p_performance_id UUID
)
RETURNS SETOF performance_bonuses
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_perf  RECORD;
  v_emp   RECORD;
  v_rule  RECORD;
  v_bonus NUMERIC;
  v_rec   performance_bonuses%ROWTYPE;
BEGIN
  SELECT ep.*, e.role, e.base_salary
  INTO v_perf
  FROM employee_performance ep
  JOIN employees e ON e.id = ep.employee_id
  WHERE ep.id = p_performance_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Performans kaydı bulunamadı'; END IF;

  -- Önce eski primleri sil (kilitli değilse)
  DELETE FROM performance_bonuses
  WHERE performance_id = p_performance_id
    AND transferred_to_payroll = false;

  -- Her aktif kuralı değerlendir
  FOR v_rule IN
    SELECT * FROM performance_rules
    WHERE lab_id = v_perf.lab_id
      AND is_active = true
      AND (
        applies_to = 'all'
        OR applies_to = 'role_' || v_perf.role
      )
  LOOP
    -- Metrik değerini al
    DECLARE
      v_metric_val NUMERIC := CASE v_rule.metric
        WHEN 'orders_completed' THEN v_perf.orders_completed
        WHEN 'on_time_rate'     THEN v_perf.on_time_rate
        WHEN 'quality_pass_rate' THEN v_perf.quality_pass_rate
        WHEN 'revenue_generated' THEN v_perf.revenue_generated
        ELSE 0
      END;
    BEGIN
      v_bonus := 0;

      IF v_rule.threshold_type = 'min' AND v_metric_val >= v_rule.threshold_value THEN
        -- Eşiğe ulaştı → sabit veya yüzde prim
        v_bonus := CASE v_rule.bonus_type
          WHEN 'fixed'   THEN v_rule.bonus_amount
          WHEN 'percent' THEN ROUND(v_perf.base_salary * v_rule.bonus_amount / 100, 2)
          ELSE 0
        END;
      ELSIF v_rule.threshold_type = 'per_unit' THEN
        -- Her birim için prim
        v_bonus := ROUND(v_metric_val * v_rule.bonus_amount, 2);
      ELSIF v_rule.threshold_type = 'target' AND v_metric_val > v_rule.threshold_value THEN
        -- Hedef üstü: aşılan her birim için
        v_bonus := ROUND((v_metric_val - v_rule.threshold_value) * v_rule.bonus_amount, 2);
      END IF;

      IF v_bonus > 0 THEN
        INSERT INTO performance_bonuses (
          lab_id, performance_id, rule_id,
          description, metric_value, bonus_amount
        )
        VALUES (
          v_perf.lab_id, p_performance_id, v_rule.id,
          v_rule.name, v_metric_val, v_bonus
        )
        RETURNING * INTO v_rec;
        RETURN NEXT v_rec;
      END IF;
    END;
  END LOOP;

  RETURN;
END;
$$;

-- ── 6. Özet view ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_performance_summary AS
SELECT
  ep.id,
  ep.lab_id,
  ep.employee_id,
  ep.period,
  e.full_name,
  e.role,
  ep.orders_assigned,
  ep.orders_completed,
  ep.orders_on_time,
  ep.on_time_rate,
  ep.quality_pass_rate,
  ep.revenue_generated,
  ep.score,
  ep.is_locked,
  COALESCE((
    SELECT SUM(pb.bonus_amount)
    FROM performance_bonuses pb
    WHERE pb.performance_id = ep.id
  ), 0) AS total_bonus,
  ep.created_at,
  ep.updated_at
FROM employee_performance ep
JOIN employees e ON e.id = ep.employee_id;
