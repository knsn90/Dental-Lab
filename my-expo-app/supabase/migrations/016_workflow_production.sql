-- ============================================================
-- 016: Workflow + Production (MES) + Design Approvals
-- ============================================================

-- Add measurement_type and doctor_approval_required to work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS measurement_type TEXT DEFAULT 'manual'
    CHECK (measurement_type IN ('manual', 'digital')),
  ADD COLUMN IF NOT EXISTS doctor_approval_required BOOLEAN DEFAULT FALSE;

-- ── case_steps ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_steps (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  step_name         TEXT        NOT NULL,
  step_order        INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'done', 'blocked')),
  assigned_to       UUID        REFERENCES profiles(id),
  requires_approval BOOLEAN     DEFAULT FALSE,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_steps_work_order ON case_steps(work_order_id);
CREATE INDEX IF NOT EXISTS idx_case_steps_status     ON case_steps(status);

-- ── approvals (design/workflow approvals) ────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id    UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  step_name        TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by     UUID        NOT NULL REFERENCES profiles(id),
  approved_by      UUID        REFERENCES profiles(id),
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_work_order ON approvals(work_order_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status     ON approvals(status);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE case_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals  ENABLE ROW LEVEL SECURITY;

-- Lab users and admins can do everything on case_steps
CREATE POLICY "lab_all_case_steps"
  ON case_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND user_type IN ('lab', 'admin')
    )
  );

-- Lab, admin, and doctors can read/write approvals
CREATE POLICY "lab_all_approvals"
  ON approvals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND user_type IN ('lab', 'admin', 'doctor')
    )
  );
