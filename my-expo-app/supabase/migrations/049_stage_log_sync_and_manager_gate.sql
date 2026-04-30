-- ============================================================================
-- 049_stage_log_sync_and_manager_gate.sql
-- Two production-readiness fixes:
--   • Bug #1: Sync stage_log with order_stages via trigger
--             (so trust score reward + doctor score triggers actually fire)
--   • Bug #3: Wire MANAGER_REVIEW gate into advance_to_next_stage
--             (high complexity / new doctor / low score triggers manager review)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper: derive Stage from station_id (uppercase substring match)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _stage_for_station(p_station_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_name TEXT;
  v_upper TEXT;
BEGIN
  IF p_station_id IS NULL THEN RETURN 'TRIAGE'; END IF;
  SELECT name INTO v_name FROM lab_stations WHERE id = p_station_id;
  IF v_name IS NULL THEN RETURN 'TRIAGE'; END IF;
  v_upper := UPPER(v_name);

  -- Most-specific-first matching (same order as TS mapStationToStage)
  IF v_upper LIKE '%MANAGER_REVIEW%'   THEN RETURN 'MANAGER_REVIEW';  END IF;
  IF v_upper LIKE '%DOCTOR_APPROVAL%'  THEN RETURN 'DOCTOR_APPROVAL'; END IF;
  IF v_upper LIKE '%TRIAGE%'           THEN RETURN 'TRIAGE';          END IF;
  IF v_upper LIKE '%DESIGN%'           THEN RETURN 'DESIGN';          END IF;
  IF v_upper LIKE '%CAM%'              THEN RETURN 'CAM';             END IF;
  IF v_upper LIKE '%MILLING%'          THEN RETURN 'MILLING';         END IF;
  IF v_upper LIKE '%SINTER%'           THEN RETURN 'SINTER';          END IF;
  IF v_upper LIKE '%FINISH%'           THEN RETURN 'FINISH';          END IF;
  IF v_upper LIKE '%QC%'               THEN RETURN 'QC';              END IF;
  IF v_upper LIKE '%SHIPPED%'          THEN RETURN 'SHIPPED';         END IF;

  RETURN 'TRIAGE';   -- fallback
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Bug #1 — order_stages → stage_log sync trigger
--    Fires on UPDATE order_stages.status:
--      • bekliyor  → aktif       :   INSERT stage_log (start_time = NOW())
--      • aktif     → onaylandi   :   UPDATE stage_log SET end_time = NOW()
--                                     (trust reward trigger fires)
--      • aktif     → reddedildi  :   UPDATE stage_log SET end_time = NOW(), reworked = TRUE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_stage_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_stage TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_stage := _stage_for_station(NEW.station_id);

  -- bekliyor → aktif: open new stage_log row
  IF NEW.status = 'aktif' AND OLD.status = 'bekliyor' THEN
    INSERT INTO stage_log (work_order_id, stage, owner_id, start_time, notes)
    VALUES (NEW.work_order_id, v_stage, NEW.technician_id, NOW(),
            'Auto-synced from order_stages');
    RETURN NEW;
  END IF;

  -- aktif → onaylandi: close open stage_log row (success path)
  IF NEW.status = 'onaylandi' AND OLD.status = 'aktif' THEN
    UPDATE stage_log
       SET end_time = NOW(),
           reworked = FALSE
     WHERE work_order_id = NEW.work_order_id
       AND stage = v_stage
       AND end_time IS NULL;
    RETURN NEW;
  END IF;

  -- aktif → reddedildi: close with reworked flag
  IF NEW.status = 'reddedildi' AND OLD.status = 'aktif' THEN
    UPDATE stage_log
       SET end_time = NOW(),
           reworked = TRUE
     WHERE work_order_id = NEW.work_order_id
       AND stage = v_stage
       AND end_time IS NULL;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_stages_log_sync ON order_stages;
CREATE TRIGGER order_stages_log_sync
  AFTER UPDATE ON order_stages
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_stage_log();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bug #3 — Wire MANAGER_REVIEW gate into advance_to_next_stage
--    When advancing FROM TRIAGE: check needs_manager_review(); if true and
--    next stage is not already MANAGER_REVIEW, insert MANAGER_REVIEW row
--    with sequence_order between current and next.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_to_next_stage(
  p_work_order_id UUID,
  p_approver_id   UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current      order_stages%ROWTYPE;
  v_next         order_stages%ROWTYPE;
  v_current_stg  TEXT;
  v_next_stg     TEXT;
  v_needs_mr     BOOLEAN;
  v_lab_id       UUID;
  v_mr_station   UUID;
  v_new_seq      INT;
  v_complexity   TEXT;
  v_case_type    TEXT;
  v_assignee     UUID;
BEGIN
  -- Find current active/completed stage
  SELECT * INTO v_current
  FROM order_stages
  WHERE work_order_id = p_work_order_id
    AND status IN ('tamamlandi', 'aktif')
  ORDER BY sequence_order
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aktif aşama bulunamadı');
  END IF;

  v_current_stg := _stage_for_station(v_current.station_id);

  -- Approve current stage (this triggers stage_log close via trg_sync_stage_log)
  UPDATE order_stages SET
    status      = 'onaylandi',
    approved_at = NOW(),
    approved_by = p_approver_id,
    manager_note = COALESCE(p_note, manager_note)
  WHERE id = v_current.id;

  INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, v_current.id, 'aşama_onaylandi', p_approver_id,
    jsonb_build_object('sequence', v_current.sequence_order, 'stage', v_current_stg));

  -- ─── MANAGER_REVIEW gate: only on TRIAGE → next ────────────────────────
  IF v_current_stg = 'TRIAGE' THEN
    v_needs_mr := needs_manager_review(p_work_order_id);

    IF v_needs_mr THEN
      -- Find next planned stage to peek what comes after TRIAGE
      SELECT * INTO v_next
      FROM order_stages
      WHERE work_order_id = p_work_order_id
        AND sequence_order > v_current.sequence_order
        AND status = 'bekliyor'
      ORDER BY sequence_order
      LIMIT 1;

      v_next_stg := CASE WHEN FOUND THEN _stage_for_station(v_next.station_id) ELSE NULL END;

      -- Only inject if not already MANAGER_REVIEW
      IF v_next_stg IS DISTINCT FROM 'MANAGER_REVIEW' THEN
        SELECT lab_id, complexity, case_type
          INTO v_lab_id, v_complexity, v_case_type
          FROM work_orders WHERE id = p_work_order_id;

        -- Find or create MANAGER_REVIEW station for this lab
        SELECT id INTO v_mr_station
          FROM lab_stations
         WHERE lab_id = v_lab_id AND UPPER(name) LIKE '%MANAGER_REVIEW%'
         LIMIT 1;

        IF v_mr_station IS NULL THEN
          INSERT INTO lab_stations (lab_id, name, color, sequence_order, is_critical, is_active)
          VALUES (v_lab_id, 'MANAGER_REVIEW', '#DC2626', 0, FALSE, TRUE)
          RETURNING id INTO v_mr_station;
        END IF;

        v_new_seq := v_current.sequence_order + 1;

        -- Bump existing later stages by 1 to make room
        UPDATE order_stages
           SET sequence_order = sequence_order + 1
         WHERE work_order_id = p_work_order_id
           AND sequence_order >= v_new_seq
           AND status = 'bekliyor';

        -- Insert MANAGER_REVIEW row as active
        v_assignee := auto_assign_user_for_stage('MANAGER_REVIEW', v_lab_id, v_complexity, v_case_type);

        INSERT INTO order_stages (work_order_id, station_id, technician_id,
          sequence_order, status, is_critical, assigned_at)
        VALUES (p_work_order_id, v_mr_station, v_assignee,
          v_new_seq, 'aktif', FALSE, NOW())
        RETURNING * INTO v_next;

        UPDATE work_orders
           SET current_stage_id = v_next.id, status = 'asamada'
         WHERE id = p_work_order_id;

        INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id, metadata)
        VALUES (p_work_order_id, v_next.id, 'manager_review_required', p_approver_id,
          jsonb_build_object('reason', 'auto-gate'));

        RETURN jsonb_build_object('ok', true, 'next_stage_id', v_next.id,
          'stage', 'MANAGER_REVIEW', 'gated', true);
      END IF;
    END IF;
  END IF;

  -- ─── Standard advance flow ──────────────────────────────────────────────
  SELECT * INTO v_next
  FROM order_stages
  WHERE work_order_id = p_work_order_id
    AND sequence_order > v_current.sequence_order
    AND status = 'bekliyor'
  ORDER BY sequence_order
  LIMIT 1;

  IF FOUND THEN
    UPDATE order_stages SET status = 'aktif', assigned_at = NOW()
    WHERE id = v_next.id;

    UPDATE work_orders SET current_stage_id = v_next.id, status = 'asamada'
    WHERE id = p_work_order_id;

    RETURN jsonb_build_object('ok', true, 'next_stage_id', v_next.id,
      'station', v_next.station_id);
  ELSE
    UPDATE work_orders SET
      current_stage_id = NULL,
      status           = 'kalite_kontrol'
    WHERE id = p_work_order_id;

    INSERT INTO order_events (work_order_id, event_type, actor_id)
    VALUES (p_work_order_id, 'kalite_gecti', p_approver_id);

    RETURN jsonb_build_object('ok', true, 'next_stage_id', NULL, 'status', 'kalite_kontrol');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_to_next_stage(UUID, UUID, TEXT) TO authenticated;

COMMIT;
