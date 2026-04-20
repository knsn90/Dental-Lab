-- ============================================================
-- 017 — Oklüzyon Analiz Tablosu
-- Her iş emrine ait oklüzyon analiz sonuçlarını saklar.
-- ============================================================

CREATE TABLE IF NOT EXISTS occlusion_analyses (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id           UUID        REFERENCES work_orders(id) ON DELETE CASCADE,
  created_by              UUID        REFERENCES profiles(id),
  lab_id                  UUID        REFERENCES labs(id),

  -- Analiz sonuçları (JSON)
  result_json             JSONB,      -- OcclusionAnalysisResult: statistics, penetrationPoints, distances özeti

  -- Görsel
  heatmap_screenshot_url  TEXT,       -- Supabase Storage URL

  -- Meta
  upper_file_name         TEXT,       -- 'upper_jaw.stl'
  lower_file_name         TEXT,       -- 'lower_jaw.stl'
  analysis_duration_ms    INTEGER,    -- kaç ms sürdü

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE occlusion_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_all_occlusion_analyses"
  ON occlusion_analyses FOR ALL
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND user_type IN ('lab', 'admin')
    )
  )
  WITH CHECK (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND user_type IN ('lab', 'admin')
    )
  );

CREATE POLICY "doctors_read_own_occlusion"
  ON occlusion_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = occlusion_analyses.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- Auto-set lab_id trigger
DO $$
BEGIN
  DROP TRIGGER IF EXISTS occlusion_analyses_auto_lab_id ON occlusion_analyses;
  CREATE TRIGGER occlusion_analyses_auto_lab_id
    BEFORE INSERT ON occlusion_analyses
    FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
EXCEPTION WHEN others THEN
  -- auto_set_lab_id may not exist yet in dev — safe to skip
  NULL;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_occlusion_analyses_work_order ON occlusion_analyses(work_order_id);
CREATE INDEX IF NOT EXISTS idx_occlusion_analyses_lab_id     ON occlusion_analyses(lab_id);
