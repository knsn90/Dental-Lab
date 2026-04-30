-- ============================================================================
-- 047_smart_assignment_qc.sql
-- Smart assignment + Trust/Doctor scores + MANAGER_REVIEW gate + DOCTOR_FEEDBACK.
-- Decisions:
--   • CHECK → TRIAGE rename (no legacy alias)
--   • Global skill_level + allowed_types on profiles
--   • Trust/Doctor defaults = 70 (neutral)
--   • AUTO_ASSIGN: filter by skill+type, sort trust DESC then workload ASC
--   • Trust: -2 to stage owner returned-to on QC reject; +1 to last prod stage owner on QC approve
--   • Doctor score: only updated in TRIAGE accept/reject
--   • total_case_count: stored column, incremented via trigger on case create
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RENAME 'CHECK' → 'TRIAGE' across all stage-bearing tables
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE user_stage_skills SET stage = 'TRIAGE' WHERE stage = 'CHECK';
UPDATE stage_log         SET stage = 'TRIAGE' WHERE stage = 'CHECK';
UPDATE checklist_log     SET stage = 'TRIAGE' WHERE stage = 'CHECK';
UPDATE reject_log        SET from_stage = 'TRIAGE' WHERE from_stage = 'CHECK';
UPDATE reject_log        SET to_stage   = 'TRIAGE' WHERE to_stage   = 'CHECK';

-- lab_stations may carry stage names — rename if exists
UPDATE lab_stations SET name = 'TRIAGE' WHERE upper(name) = 'CHECK';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NEW COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: skill model + scores + counters
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skill_level       TEXT
    CHECK (skill_level IN ('junior','mid','senior')) DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS allowed_types     TEXT[],                       -- NULL = all types allowed
  ADD COLUMN IF NOT EXISTS trust_score       INT  DEFAULT 70 CHECK (trust_score   BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS doctor_score      INT  DEFAULT 70 CHECK (doctor_score  BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS total_case_count  INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reject_count      INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_count   INT  DEFAULT 0;

-- Backfill defaults for existing rows where columns are NULL
UPDATE profiles SET skill_level      = 'mid' WHERE skill_level      IS NULL;
UPDATE profiles SET trust_score      = 70    WHERE trust_score      IS NULL;
UPDATE profiles SET doctor_score     = 70    WHERE doctor_score     IS NULL;
UPDATE profiles SET total_case_count = 0     WHERE total_case_count IS NULL;
UPDATE profiles SET reject_count     = 0     WHERE reject_count     IS NULL;
UPDATE profiles SET completed_count  = 0     WHERE completed_count  IS NULL;

-- work_orders: complexity + doctor_id (if missing)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS complexity TEXT
    CHECK (complexity IN ('low','medium','high')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS doctor_id  UUID REFERENCES profiles(id);

UPDATE work_orders SET complexity = 'medium' WHERE complexity IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER: increment doctor.total_case_count on work_order INSERT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_increment_doctor_case_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    UPDATE profiles
       SET total_case_count = COALESCE(total_case_count, 0) + 1
     WHERE id = NEW.doctor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_doctor_case_counter ON work_orders;
CREATE TRIGGER work_orders_doctor_case_counter
  AFTER INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_increment_doctor_case_count();

-- Backfill total_case_count for existing doctors
UPDATE profiles p
   SET total_case_count = sub.cnt
  FROM (
    SELECT doctor_id, COUNT(*)::int AS cnt
      FROM work_orders
     WHERE doctor_id IS NOT NULL
     GROUP BY doctor_id
  ) sub
 WHERE p.id = sub.doctor_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AUTO_ASSIGN — skill-aware, trust-ranked
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: numeric rank for skill_level
CREATE OR REPLACE FUNCTION skill_level_rank(level TEXT) RETURNS INT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE level
    WHEN 'junior' THEN 1
    WHEN 'mid'    THEN 2
    WHEN 'senior' THEN 3
    ELSE 2
  END;
$$;

CREATE OR REPLACE FUNCTION skill_required_rank(complexity TEXT) RETURNS INT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE complexity
    WHEN 'low'    THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high'   THEN 3
    ELSE 2
  END;
$$;

-- New signature: (stage, lab_id, complexity, case_type) — old wrapper kept below
CREATE OR REPLACE FUNCTION auto_assign_user_for_stage(
  p_stage      TEXT,
  p_lab_id     UUID,
  p_complexity TEXT DEFAULT 'medium',
  p_case_type  TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  WITH eligible AS (
    SELECT
      p.id,
      p.trust_score,
      COALESCE((
        SELECT COUNT(*) FROM stage_log sl
         WHERE sl.owner_id = p.id AND sl.end_time IS NULL
      ), 0) AS workload
    FROM profiles p
    JOIN user_stage_skills us ON us.user_id = p.id AND us.stage = p_stage
    WHERE p.is_active = TRUE
      AND p.user_type = 'lab'
      AND (p.lab_id = p_lab_id OR p.id = p_lab_id)
      AND skill_level_rank(p.skill_level) >= skill_required_rank(p_complexity)
      AND (
        p.allowed_types IS NULL
        OR p_case_type IS NULL
        OR p_case_type = ANY(p.allowed_types)
      )
  )
  SELECT id INTO v_user_id
    FROM eligible
   ORDER BY trust_score DESC NULLS LAST, workload ASC
   LIMIT 1;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_assign_user_for_stage(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRUST SCORE — QC reject (penalty) and QC approve (reward)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Patch return_to_stage to penalize the owner of the stage we return TO
--     (stage_log row that becomes the new active stage)
CREATE OR REPLACE FUNCTION return_to_stage(
  p_work_order_id UUID,
  p_to_stage      TEXT,
  p_reason        TEXT,
  p_rejected_by   UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_stage    TEXT;
  v_prev_owner    UUID;
  v_lab_id        UUID;
  v_complexity    TEXT;
  v_case_type     TEXT;
  v_assignee      UUID;
BEGIN
  -- Current active stage = from_stage
  SELECT stage INTO v_from_stage
    FROM stage_log
   WHERE work_order_id = p_work_order_id AND end_time IS NULL
   ORDER BY start_time DESC LIMIT 1;

  -- Find previous owner who did this TO stage (most recent)
  SELECT owner_id INTO v_prev_owner
    FROM stage_log
   WHERE work_order_id = p_work_order_id
     AND stage = p_to_stage
     AND owner_id IS NOT NULL
   ORDER BY start_time DESC LIMIT 1;

  -- Lab + case fields for fallback auto-assign
  SELECT lab_id, complexity, case_type
    INTO v_lab_id, v_complexity, v_case_type
    FROM work_orders WHERE id = p_work_order_id;

  -- Reject log
  INSERT INTO reject_log (work_order_id, from_stage, to_stage, reason, rejected_by, rejected_at)
  VALUES (p_work_order_id, v_from_stage, p_to_stage, p_reason, p_rejected_by, NOW());

  -- Increment rework count
  UPDATE work_orders
     SET rework_count = COALESCE(rework_count, 0) + 1
   WHERE id = p_work_order_id;

  -- Mark currently active stages reddedildi
  UPDATE stage_log
     SET end_time = NOW(),
         reworked = TRUE,
         notes = COALESCE(notes, '') || ' [REJECTED: ' || COALESCE(p_reason, '') || ']'
   WHERE work_order_id = p_work_order_id AND end_time IS NULL;

  -- Penalize the previous owner of TO-stage (-2 trust, +1 reject_count)
  IF v_prev_owner IS NOT NULL THEN
    UPDATE profiles
       SET trust_score  = GREATEST(0, COALESCE(trust_score, 70) - 2),
           reject_count = COALESCE(reject_count, 0) + 1
     WHERE id = v_prev_owner;
    v_assignee := v_prev_owner;
  ELSE
    v_assignee := auto_assign_user_for_stage(p_to_stage, v_lab_id, v_complexity, v_case_type);
  END IF;

  -- Insert new active stage
  INSERT INTO stage_log (work_order_id, stage, owner_id, start_time, notes)
  VALUES (p_work_order_id, p_to_stage, v_assignee, NOW(),
          'REWORK: ' || COALESCE(p_reason, ''));
END;
$$;

GRANT EXECUTE ON FUNCTION return_to_stage(UUID, TEXT, TEXT, UUID) TO authenticated;

-- 5b. QC approve reward: when stage_log row for QC ends successfully (end_time set, not reworked),
--     +1 trust_score and +1 completed_count to the owner of the LAST production stage
--     (i.e. the most recent non-QC, non-SHIPPED, non-rework stage_log entry before this QC).
CREATE OR REPLACE FUNCTION trg_qc_approve_reward()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_last_prod_owner UUID;
BEGIN
  -- Trigger fires only on QC stage completion without rework
  IF NEW.stage = 'QC' AND NEW.end_time IS NOT NULL AND COALESCE(NEW.reworked, FALSE) = FALSE
     AND (OLD.end_time IS NULL OR OLD.end_time IS DISTINCT FROM NEW.end_time) THEN

    SELECT owner_id INTO v_last_prod_owner
      FROM stage_log
     WHERE work_order_id = NEW.work_order_id
       AND stage NOT IN ('QC','SHIPPED','TRIAGE','MANAGER_REVIEW','DOCTOR_APPROVAL')
       AND owner_id IS NOT NULL
       AND COALESCE(reworked, FALSE) = FALSE
     ORDER BY start_time DESC LIMIT 1;

    IF v_last_prod_owner IS NOT NULL THEN
      UPDATE profiles
         SET trust_score     = LEAST(100, COALESCE(trust_score, 70) + 1),
             completed_count = COALESCE(completed_count, 0) + 1
       WHERE id = v_last_prod_owner;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stage_log_qc_reward ON stage_log;
CREATE TRIGGER stage_log_qc_reward
  AFTER UPDATE ON stage_log
  FOR EACH ROW
  EXECUTE FUNCTION trg_qc_approve_reward();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DOCTOR SCORE — TRIAGE accept (+1) / reject (-2)
-- ─────────────────────────────────────────────────────────────────────────────

-- TRIAGE accept = stage_log for stage='TRIAGE' end_time set AND not reworked
CREATE OR REPLACE FUNCTION trg_doctor_score_triage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_doctor_id UUID;
BEGIN
  IF NEW.stage = 'TRIAGE' AND NEW.end_time IS NOT NULL
     AND (OLD.end_time IS NULL OR OLD.end_time IS DISTINCT FROM NEW.end_time) THEN

    SELECT doctor_id INTO v_doctor_id FROM work_orders WHERE id = NEW.work_order_id;
    IF v_doctor_id IS NULL THEN RETURN NEW; END IF;

    IF COALESCE(NEW.reworked, FALSE) = FALSE THEN
      -- Accepted
      UPDATE profiles
         SET doctor_score = LEAST(100, COALESCE(doctor_score, 70) + 1)
       WHERE id = v_doctor_id;
    ELSE
      -- Rejected (rework path)
      UPDATE profiles
         SET doctor_score = GREATEST(0, COALESCE(doctor_score, 70) - 2)
       WHERE id = v_doctor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stage_log_doctor_score ON stage_log;
CREATE TRIGGER stage_log_doctor_score
  AFTER UPDATE ON stage_log
  FOR EACH ROW
  EXECUTE FUNCTION trg_doctor_score_triage();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MANAGER_REVIEW gate decision helper
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION needs_manager_review(p_work_order_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_complexity     TEXT;
  v_doctor_id      UUID;
  v_doctor_score   INT;
  v_doctor_cases   INT;
BEGIN
  SELECT w.complexity, w.doctor_id, p.doctor_score, p.total_case_count
    INTO v_complexity, v_doctor_id, v_doctor_score, v_doctor_cases
    FROM work_orders w
    LEFT JOIN profiles p ON p.id = w.doctor_id
   WHERE w.id = p_work_order_id;

  IF v_complexity = 'high' THEN RETURN TRUE; END IF;
  IF v_doctor_id IS NULL THEN RETURN FALSE; END IF;
  IF COALESCE(v_doctor_cases, 0) < 5 THEN RETURN TRUE; END IF;
  IF COALESCE(v_doctor_score, 70) < 60 THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION needs_manager_review(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DOCTOR_FEEDBACK status (no new stage — pause case)
-- ─────────────────────────────────────────────────────────────────────────────

-- Just rely on work_orders.status = 'doktor_geri_bildirim' as a paused state.
-- Manager action wrapper:
CREATE OR REPLACE FUNCTION send_to_doctor_feedback(
  p_work_order_id UUID,
  p_message       TEXT,
  p_sender        UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Close active stage
  UPDATE stage_log
     SET end_time = NOW(),
         notes    = COALESCE(notes, '') || ' [FEEDBACK_TO_DOCTOR: ' || COALESCE(p_message, '') || ']'
   WHERE work_order_id = p_work_order_id AND end_time IS NULL;

  -- Pause the case
  UPDATE work_orders
     SET status = 'doktor_geri_bildirim'
   WHERE id = p_work_order_id;

  -- Reject log entry for trail
  INSERT INTO reject_log (work_order_id, from_stage, to_stage, reason, rejected_by, rejected_at)
  VALUES (p_work_order_id, 'MANAGER_REVIEW', 'DOCTOR_FEEDBACK', p_message, p_sender, NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION send_to_doctor_feedback(UUID, TEXT, UUID) TO authenticated;

COMMIT;
