-- ═══════════════════════════════════════════════════════════════════════════
-- 026 — İnsan Kaynakları: İzin & Devam Yönetimi
--   • employee_leaves      : İzin talepleri (yıllık, mazeret, hastalık…)
--   • employee_attendance  : Günlük giriş/çıkış kayıtları
--   • v_leave_summary      : Çalışan başına izin özeti
--   • v_attendance_monthly : Aylık devam özeti
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. İzin talepleri ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_leaves (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID        NOT NULL DEFAULT get_my_lab_id(),
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  leave_type    TEXT        NOT NULL DEFAULT 'yillik'
                CHECK (leave_type IN (
                  'yillik',    -- Yıllık izin
                  'mazeret',   -- Mazeret izni (3 güne kadar ücretli)
                  'hastalik',  -- Hastalık / rapor
                  'ucretsiz',  -- Ücretsiz izin
                  'dogum',     -- Doğum izni
                  'olum',      -- Ölüm izni (vefat)
                  'evlilik'    -- Evlilik izni
                )),

  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  days_count    INT         NOT NULL DEFAULT 1 CHECK (days_count > 0),

  reason        TEXT,                        -- Çalışanın açıklaması
  status        TEXT        NOT NULL DEFAULT 'bekliyor'
                CHECK (status IN ('bekliyor','onaylandi','reddedildi','iptal')),

  reject_reason TEXT,                        -- Red gerekçesi
  approved_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

ALTER TABLE employee_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_leaves_lab_own" ON employee_leaves
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_employee_leaves_emp
  ON employee_leaves (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_status
  ON employee_leaves (lab_id, status);

-- ── 2. Devam takibi ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_attendance (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID        NOT NULL DEFAULT get_my_lab_id(),
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  work_date     DATE        NOT NULL,
  check_in      TIME,                        -- Giriş saati (HH:MM)
  check_out     TIME,                        -- Çıkış saati (HH:MM)

  status        TEXT        NOT NULL DEFAULT 'normal'
                CHECK (status IN (
                  'normal',       -- Normal çalışma
                  'gec',          -- Geç giriş
                  'erken_cikis',  -- Erken çıkış
                  'yarim_gun',    -- Yarım gün
                  'devamsiz',     -- Devamsızlık
                  'izinli',       -- İzin günü (leaves tablosundan)
                  'hastalik',     -- Rapor / sağlık
                  'resmi_tatil'   -- Resmi tatil
                )),

  -- Çalışma süresi (dakika) — check_in & check_out varsa otomatik
  work_minutes  INT GENERATED ALWAYS AS (
    CASE
      WHEN check_in IS NOT NULL AND check_out IS NOT NULL AND check_out > check_in
      THEN EXTRACT(EPOCH FROM (check_out - check_in))::INT / 60
      ELSE NULL
    END
  ) STORED,

  overtime_minutes INT NOT NULL DEFAULT 0,   -- Fazla mesai (dakika)
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, work_date)            -- Günde tek kayıt
);

ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_attendance_lab_own" ON employee_attendance
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_employee_attendance_emp
  ON employee_attendance (employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_date
  ON employee_attendance (lab_id, work_date DESC);

-- ── 3. Yardımcı fonksiyon: Kıdeme göre yıllık izin hakkı ─────────────────
CREATE OR REPLACE FUNCTION annual_leave_entitlement(start_date DATE)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, start_date)) < 1  THEN 0   -- 1 yıl dolmamış
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, start_date)) < 5  THEN 14  -- 1-4 yıl
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, start_date)) < 15 THEN 20  -- 5-14 yıl
    ELSE 26                                                              -- 15+ yıl
  END;
$$;

-- ── 4. İzin özet view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_leave_summary AS
SELECT
  e.id                AS employee_id,
  e.lab_id,
  e.full_name,
  e.role,
  e.start_date        AS employment_start,
  e.is_active,

  -- Yıllık izin hakkı (kıdem hesabı)
  annual_leave_entitlement(e.start_date) AS annual_entitlement,

  -- Bu yıl onaylanan yıllık izin günleri
  COALESCE(SUM(
    CASE WHEN l.leave_type = 'yillik'
          AND l.status     = 'onaylandi'
          AND EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    THEN l.days_count ELSE 0 END
  ), 0) AS annual_used,

  -- Kalan yıllık izin
  annual_leave_entitlement(e.start_date) - COALESCE(SUM(
    CASE WHEN l.leave_type = 'yillik'
          AND l.status     = 'onaylandi'
          AND EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    THEN l.days_count ELSE 0 END
  ), 0) AS annual_remaining,

  -- Bekleyen talep sayısı
  COUNT(CASE WHEN l.status = 'bekliyor' THEN 1 END) AS pending_count,

  -- Şu an izinde mi?
  BOOL_OR(
    l.status = 'onaylandi'
    AND CURRENT_DATE BETWEEN l.start_date AND l.end_date
  ) AS currently_on_leave,

  -- Bu ay toplam izin günü
  COALESCE(SUM(
    CASE WHEN l.status = 'onaylandi'
          AND DATE_TRUNC('month', l.start_date) = DATE_TRUNC('month', CURRENT_DATE)
    THEN l.days_count ELSE 0 END
  ), 0) AS leave_days_this_month

FROM employees e
LEFT JOIN employee_leaves l ON l.employee_id = e.id
GROUP BY e.id, e.lab_id, e.full_name, e.role, e.start_date, e.is_active;

-- ── 5. Devam aylık özet view ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_attendance_monthly AS
SELECT
  a.employee_id,
  a.lab_id,
  DATE_TRUNC('month', a.work_date)::DATE              AS month,
  COUNT(*)                                             AS total_records,
  COUNT(CASE WHEN a.status = 'normal'      THEN 1 END) AS normal_days,
  COUNT(CASE WHEN a.status = 'gec'         THEN 1 END) AS late_days,
  COUNT(CASE WHEN a.status = 'erken_cikis' THEN 1 END) AS early_exit_days,
  COUNT(CASE WHEN a.status = 'yarim_gun'   THEN 1 END) AS half_days,
  COUNT(CASE WHEN a.status = 'devamsiz'    THEN 1 END) AS absent_days,
  COUNT(CASE WHEN a.status = 'izinli'      THEN 1 END) AS leave_days,
  COUNT(CASE WHEN a.status = 'hastalik'    THEN 1 END) AS sick_days,
  COALESCE(SUM(a.work_minutes), 0)                     AS total_work_minutes,
  COALESCE(SUM(a.overtime_minutes), 0)                 AS total_overtime_minutes
FROM employee_attendance a
GROUP BY a.employee_id, a.lab_id, DATE_TRUNC('month', a.work_date)::DATE;
