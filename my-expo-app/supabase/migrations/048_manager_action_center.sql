-- ============================================================================
-- 048_manager_action_center.sql
-- Manager Action Center — SLA alerts, delay tracking, force/skip actions.
-- Decisions:
--   • work_orders.delay_reason  → current state (fast UI)
--   • delay_log table           → full history
--   • stage_log.forced BOOLEAN  → traceable forced advances
--   • force_advance_stage(wo)   → confirms-by-caller, writes forced=true + note
--   • skip_to_qc(wo)            → close current with SKIPPED_TO_QC, open QC
--   • set_delay_reason(wo, r)   → upsert reason + history row
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. work_orders.delay_reason (current state) + stage_log.forced (audit)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS delay_reason TEXT
    CHECK (delay_reason IN ('waiting_doctor','workload','technician_issue','material_issue'));

ALTER TABLE stage_log
  ADD COLUMN IF NOT EXISTS forced BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. delay_log table — full history
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delay_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('waiting_doctor','workload','technician_issue','material_issue')),
  set_by          UUID REFERENCES profiles(id),
  set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at      TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_delay_log_work_order ON delay_log(work_order_id, set_at DESC);

ALTER TABLE delay_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delay_log_read ON delay_log;
CREATE POLICY delay_log_read ON delay_log
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS delay_log_write ON delay_log;
CREATE POLICY delay_log_write ON delay_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. set_delay_reason — upsert current state + log history
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_delay_reason(
  p_work_order_id UUID,
  p_reason        TEXT,
  p_manager_id    UUID,
  p_notes         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_stage TEXT;
BEGIN
  -- Find current active stage
  SELECT stage INTO v_current_stage
    FROM stage_log
   WHERE work_order_id = p_work_order_id AND end_time IS NULL
   ORDER BY start_time DESC LIMIT 1;

  -- Update work_order current state (NULL = clear)
  UPDATE work_orders SET delay_reason = p_reason WHERE id = p_work_order_id;

  -- Close any open delay_log entry
  UPDATE delay_log
     SET cleared_at = NOW()
   WHERE work_order_id = p_work_order_id AND cleared_at IS NULL;

  -- Insert new history row (only if a reason was set)
  IF p_reason IS NOT NULL THEN
    INSERT INTO delay_log (work_order_id, stage, reason, set_by, notes)
    VALUES (p_work_order_id, COALESCE(v_current_stage, 'UNKNOWN'), p_reason, p_manager_id, p_notes);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_delay_reason(UUID, TEXT, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. force_advance_stage — manager skips checklist, advances current → next
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION force_advance_stage(
  p_work_order_id UUID,
  p_manager_id    UUID,
  p_next_stage    TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lab_id     UUID;
  v_complexity TEXT;
  v_case_type  TEXT;
  v_assignee   UUID;
BEGIN
  -- Close current active stage with forced flag
  UPDATE stage_log
     SET end_time = NOW(),
         forced   = TRUE,
         notes    = COALESCE(notes, '') || ' [FORCED by manager]'
   WHERE work_order_id = p_work_order_id AND end_time IS NULL;

  -- Get lab + complexity for auto-assign
  SELECT lab_id, complexity, case_type
    INTO v_lab_id, v_complexity, v_case_type
    FROM work_orders WHERE id = p_work_order_id;

  -- Auto-assign next stage owner
  v_assignee := auto_assign_user_for_stage(p_next_stage, v_lab_id, v_complexity, v_case_type);

  -- Open next stage
  INSERT INTO stage_log (work_order_id, stage, owner_id, start_time, notes)
  VALUES (p_work_order_id, p_next_stage, v_assignee, NOW(),
          'Auto-opened after FORCED advance by manager');

  -- Audit event
  INSERT INTO order_events (work_order_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, 'manager_forced_advance', p_manager_id,
          jsonb_build_object('next_stage', p_next_stage));
END;
$$;

GRANT EXECUTE ON FUNCTION force_advance_stage(UUID, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. skip_to_qc — bypass production stages, jump straight to QC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION skip_to_qc(
  p_work_order_id UUID,
  p_manager_id    UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lab_id     UUID;
  v_complexity TEXT;
  v_case_type  TEXT;
  v_assignee   UUID;
BEGIN
  -- Close any active stage(s) with SKIPPED_TO_QC marker
  UPDATE stage_log
     SET end_time = NOW(),
         forced   = TRUE,
         notes    = COALESCE(notes, '') || ' [SKIPPED_TO_QC by manager]'
   WHERE work_order_id = p_work_order_id AND end_time IS NULL;

  -- Get lab + complexity for auto-assign
  SELECT lab_id, complexity, case_type
    INTO v_lab_id, v_complexity, v_case_type
    FROM work_orders WHERE id = p_work_order_id;

  v_assignee := auto_assign_user_for_stage('QC', v_lab_id, v_complexity, v_case_type);

  INSERT INTO stage_log (work_order_id, stage, owner_id, start_time, notes)
  VALUES (p_work_order_id, 'QC', v_assignee, NOW(),
          'SKIPPED_TO_QC by manager');

  INSERT INTO order_events (work_order_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, 'manager_skipped_to_qc', p_manager_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION skip_to_qc(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. add_manager_note — append a free-form note as an order_event
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_manager_note(
  p_work_order_id UUID,
  p_manager_id    UUID,
  p_note          TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO order_events (work_order_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, 'manager_note', p_manager_id,
          jsonb_build_object('note', p_note));
END;
$$;

GRANT EXECUTE ON FUNCTION add_manager_note(UUID, UUID, TEXT) TO authenticated;

COMMIT;
