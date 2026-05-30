-- ============================================================================
-- 053 — Doctor Approval Gate + case_steps sync
--
-- 1. advance_to_next_stage: doctor_approval_status = 'pending' iken bloke
-- 2. doctor_approve: onaylanınca doktor_onay case_step'i 'done' yapılır;
--    reddedilince 'blocked'
-- ============================================================================

BEGIN;

-- ── 1. advance_to_next_stage — gate ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_to_next_stage(
  p_work_order_id UUID,
  p_approver_id   UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current      order_stages%ROWTYPE;
  v_next         order_stages%ROWTYPE;
  v_dr_approval  TEXT;
BEGIN
  -- Hekim onay gate: pending iken bir sonraki aşamaya geçilemez
  SELECT doctor_approval_status INTO v_dr_approval
  FROM work_orders WHERE id = p_work_order_id;

  IF v_dr_approval = 'pending' THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Hekim tasarım onayı bekleniyor, aşama ilerleyemez'
    );
  END IF;

  -- Mevcut aktif aşamayı bul
  SELECT * INTO v_current
  FROM order_stages
  WHERE work_order_id = p_work_order_id
    AND status IN ('tamamlandi', 'aktif')
  ORDER BY sequence_order
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aktif aşama bulunamadı');
  END IF;

  -- Mevcut aşamayı onayla
  UPDATE order_stages SET
    status       = 'onaylandi',
    approved_at  = NOW(),
    approved_by  = p_approver_id,
    manager_note = COALESCE(p_note, manager_note)
  WHERE id = v_current.id;

  INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, v_current.id, 'aşama_onaylandi', p_approver_id,
    jsonb_build_object('sequence', v_current.sequence_order));

  -- Sonraki aşamayı bul
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

    RETURN jsonb_build_object('ok', true, 'next_stage_id', NULL,
      'status', 'kalite_kontrol');
  END IF;
END;
$$;

-- ── 2. doctor_approve — case_step sync ──────────────────────────────────────

CREATE OR REPLACE FUNCTION doctor_approve(
  p_token    TEXT,
  p_approved BOOLEAN,
  p_note     TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wo_id  UUID;
  v_status TEXT;
BEGIN
  SELECT id, doctor_approval_status INTO v_wo_id, v_status
  FROM work_orders
  WHERE doctor_approval_token = p_token
    AND doctor_approval_expires_at > NOW()
  LIMIT 1;

  IF v_wo_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'token_invalid_or_expired');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_decided');
  END IF;

  -- Onay durumunu kaydet (advance_to_next_stage gate için önceden yazılmalı)
  UPDATE work_orders SET
    doctor_approval_status     = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    doctor_approval_token      = NULL,
    doctor_approval_expires_at = NOW()
  WHERE id = v_wo_id;

  -- design_qc_checks güncelle (varsa)
  UPDATE design_qc_checks SET
    doctor_approved    = p_approved,
    doctor_approved_at = NOW(),
    doctor_note        = p_note
  WHERE work_order_id = v_wo_id;

  -- case_steps: doktor_onay adımını senkronize et
  UPDATE case_steps SET
    status      = CASE WHEN p_approved THEN 'done' ELSE 'blocked' END,
    finished_at = CASE WHEN p_approved THEN NOW() ELSE NULL END
  WHERE work_order_id = v_wo_id
    AND step_name = 'doktor_onay';

  IF p_approved THEN
    -- Gate artık geçmiş (status='approved'), advance çalışır
    PERFORM advance_to_next_stage(v_wo_id, NULL);
  ELSE
    -- Tasarım aşamasına geri dön
    UPDATE work_orders SET
      status       = 'asamada',
      rework_count = COALESCE(rework_count, 0) + 1
    WHERE id = v_wo_id;

    UPDATE order_stages SET status = 'aktif', completed_at = NULL
    WHERE id = (
      SELECT id FROM order_stages
      WHERE work_order_id = v_wo_id
      ORDER BY sequence_order DESC LIMIT 1
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'approved', p_approved);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION doctor_approve(TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ── 3. approvals tablosu için doktor okuma politikası ───────────────────────

DROP POLICY IF EXISTS "doctor_read_own_approvals" ON approvals;
CREATE POLICY "doctor_read_own_approvals" ON approvals
  FOR SELECT USING (
    auth.uid() IN (
      SELECT doctor_id FROM work_orders WHERE id = work_order_id
    )
  );

COMMIT;
