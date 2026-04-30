-- ─────────────────────────────────────────────────────────────────────────────
-- 044 — ERP Workflow Foundation
-- ─────────────────────────────────────────────────────────────────────────────
-- Mevcut work_orders + order_stages + lab_stations üstüne kuruluyor.
-- Eklenenler:
--   * user_stage_skills      (kim hangi stage'i yapabilir)
--   * stage_log              (audit: stage başlangıç/bitiş + owner)
--   * checklist_log          (audit: hangi item ne zaman tikli)
--   * reject_log             (QC red sebebi + return stage)
--   * doctor_approval_*      (work_orders üzerinde)
--   * priority               (work_orders)
--   * rework_count           (work_orders)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. work_orders kolonları ──────────────────────────────────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS priority                 TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS rework_count             INTEGER NOT NULL DEFAULT 0;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS doctor_approval_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS doctor_approval_token    TEXT;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS doctor_approval_expires_at TIMESTAMPTZ;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS doctor_approval_status   TEXT
    CHECK (doctor_approval_status IN ('pending', 'approved', 'rejected', 'timeout', NULL));

CREATE INDEX IF NOT EXISTS idx_work_orders_priority
  ON work_orders (priority, created_at DESC);

-- ── 2. user_stage_skills ─────────────────────────────────────────────────────
-- Kim hangi stage'i yapabilir (multi-skill). AUTO_ASSIGN bu tabloya bakar.

CREATE TABLE IF NOT EXISTS user_stage_skills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,
    -- 'CHECK' | 'DESIGN' | 'CAM' | 'MILLING' | 'SINTER' | 'FINISH' | 'QC'
  lab_id       UUID REFERENCES profiles(id),  -- multi-tenancy (opsiyonel)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_user_stage_skills_stage ON user_stage_skills (stage, lab_id);

ALTER TABLE user_stage_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_stage_skills_select ON user_stage_skills;
CREATE POLICY user_stage_skills_select ON user_stage_skills
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
  );

DROP POLICY IF EXISTS user_stage_skills_write ON user_stage_skills;
CREATE POLICY user_stage_skills_write ON user_stage_skills
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles
                    WHERE user_type = 'admin'
                       OR (user_type = 'lab' AND role IN ('manager', 'admin')))
  );

-- ── 3. stage_log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage          TEXT NOT NULL,
  owner_id       UUID REFERENCES profiles(id),
  start_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time       TIMESTAMPTZ,
  reworked       BOOLEAN NOT NULL DEFAULT FALSE,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_stage_log_work_order ON stage_log (work_order_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_stage_log_owner      ON stage_log (owner_id, end_time);

ALTER TABLE stage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_log_select ON stage_log;
CREATE POLICY stage_log_select ON stage_log
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

DROP POLICY IF EXISTS stage_log_write ON stage_log;
CREATE POLICY stage_log_write ON stage_log
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
  );

-- ── 4. checklist_log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS checklist_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage          TEXT NOT NULL,
  item_key       TEXT NOT NULL,           -- ör. 'margin_ok', 'die_spacing_ok'
  checked        BOOLEAN NOT NULL,
  checked_by     UUID REFERENCES profiles(id),
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_order_id, stage, item_key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_log_wo ON checklist_log (work_order_id, stage);

ALTER TABLE checklist_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_log_select ON checklist_log;
CREATE POLICY checklist_log_select ON checklist_log
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
  );

DROP POLICY IF EXISTS checklist_log_write ON checklist_log;
CREATE POLICY checklist_log_write ON checklist_log
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
  );

-- ── 5. reject_log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reject_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  from_stage     TEXT NOT NULL,
  to_stage       TEXT NOT NULL,
  reason         TEXT NOT NULL,
  rejected_by    UUID REFERENCES profiles(id),
  rejected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reject_log_wo ON reject_log (work_order_id, rejected_at DESC);

ALTER TABLE reject_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reject_log_select ON reject_log;
CREATE POLICY reject_log_select ON reject_log
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

DROP POLICY IF EXISTS reject_log_write ON reject_log;
CREATE POLICY reject_log_write ON reject_log
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
  );

-- ── 6. AUTO_ASSIGN — stored procedure ────────────────────────────────────────
-- Belirli stage için en az iş yükü olan kullanıcıyı seçer.
-- Önce skill match, sonra aktif stage count'a göre sıralı.

CREATE OR REPLACE FUNCTION auto_assign_user_for_stage(
  p_stage   TEXT,
  p_lab_id  UUID
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT s.user_id INTO v_user_id
  FROM user_stage_skills s
  JOIN profiles p ON p.id = s.user_id
  LEFT JOIN order_stages os
    ON os.technician_id = s.user_id
    AND os.status = 'aktif'
  WHERE s.stage = p_stage
    AND p.is_active = TRUE
    AND (p_lab_id IS NULL OR p.lab_id = p_lab_id OR p.id = p_lab_id)
  GROUP BY s.user_id
  ORDER BY COUNT(os.id) ASC, s.user_id
  LIMIT 1;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql STABLE;
