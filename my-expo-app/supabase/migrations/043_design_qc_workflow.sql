-- ─────────────────────────────────────────────────────────────────────────────
-- 043 — Design QC Workflow
-- ─────────────────────────────────────────────────────────────────────────────
--   * design_qc_checks tablosu — Design stage sonrası QC checklist
--   * work_orders.requires_design_approval — hekim onayı isteği bayrağı
--   * stage_status enum'a 'hekim_onay_bekliyor' eklendi (artık opsiyonel)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS requires_design_approval BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS design_qc_checks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id              UUID NOT NULL REFERENCES order_stages(id) ON DELETE CASCADE,
  work_order_id         UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  -- Checklist alanları
  margin_ok             BOOLEAN NOT NULL DEFAULT FALSE,
  die_spacing_ok        BOOLEAN NOT NULL DEFAULT FALSE,
  contacts_ok           BOOLEAN NOT NULL DEFAULT FALSE,
  occlusion_ok          BOOLEAN NOT NULL DEFAULT FALSE,
  anatomy_ok            BOOLEAN NOT NULL DEFAULT FALSE,
  stl_export_ok         BOOLEAN NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  -- QC operatörü
  checked_by            UUID REFERENCES profiles(id),
  checked_at            TIMESTAMPTZ,
  -- Hekim onay akışı (opsiyonel)
  needs_doctor_approval BOOLEAN NOT NULL DEFAULT FALSE,
  doctor_approved       BOOLEAN,
  doctor_approved_at    TIMESTAMPTZ,
  doctor_note           TEXT,
  doctor_id             UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_qc_stage ON design_qc_checks(stage_id);
CREATE INDEX IF NOT EXISTS idx_design_qc_work_order ON design_qc_checks(work_order_id);

ALTER TABLE design_qc_checks ENABLE ROW LEVEL SECURITY;

-- Lab + admin + ilgili hekim okuyabilir
DROP POLICY IF EXISTS design_qc_select ON design_qc_checks;
CREATE POLICY design_qc_select ON design_qc_checks
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

-- Lab manager + admin oluşturabilir/güncelleyebilir
DROP POLICY IF EXISTS design_qc_write ON design_qc_checks;
CREATE POLICY design_qc_write ON design_qc_checks
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE user_type IN ('admin')
         OR (user_type = 'lab' AND role IN ('manager', 'admin'))
    )
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

COMMENT ON TABLE design_qc_checks IS
  'Design stage QC checklist + opsiyonel hekim onay akışı. Stage tamamlandıktan sonra doldurulur.';
