-- ─────────────────────────────────────────────────────────────────────────────
-- 045 — Doctor Approval Workflow
-- ─────────────────────────────────────────────────────────────────────────────
--   * generate_doctor_approval_token(work_order_id) → token + 48h expiry
--   * get_pending_approval(token)                    → public read by token
--   * doctor_approve(token, approved, note)          → record decision
--   * sweep_doctor_approval_timeouts()               → cron, 48h sonra timeout → CAM
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Token üret + work_order'a kaydet ─────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_doctor_approval_token(p_work_order_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Rastgele güvenli token (32 char)
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  UPDATE work_orders SET
    doctor_approval_token      = v_token,
    doctor_approval_expires_at = NOW() + INTERVAL '48 hours',
    doctor_approval_status     = 'pending',
    doctor_approval_required   = TRUE
  WHERE id = p_work_order_id;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Public lookup (anon key) — sadece token ile minimum bilgi ─────────────

CREATE OR REPLACE FUNCTION get_pending_approval(p_token TEXT)
RETURNS TABLE (
  work_order_id    UUID,
  order_number     TEXT,
  patient_name     TEXT,
  doctor_name      TEXT,
  work_type        TEXT,
  shade            TEXT,
  delivery_date    DATE,
  tooth_numbers    INTEGER[],
  status           TEXT,
  expires_at       TIMESTAMPTZ
) AS $$
  SELECT
    wo.id,
    wo.order_number,
    wo.patient_name,
    p.full_name,
    wo.work_type,
    wo.shade,
    wo.delivery_date,
    wo.tooth_numbers,
    wo.doctor_approval_status,
    wo.doctor_approval_expires_at
  FROM work_orders wo
  LEFT JOIN profiles p ON p.id = wo.doctor_id
  WHERE wo.doctor_approval_token = p_token
    AND wo.doctor_approval_expires_at > NOW()
    AND wo.doctor_approval_status = 'pending'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pending_approval(TEXT) TO anon, authenticated;

-- ── 3. Hekim kararı kaydet (anon → public) ──────────────────────────────────

CREATE OR REPLACE FUNCTION doctor_approve(
  p_token    TEXT,
  p_approved BOOLEAN,
  p_note     TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wo_id   UUID;
  v_status  TEXT;
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

  UPDATE work_orders SET
    doctor_approval_status     = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    doctor_approval_token      = NULL,    -- tek kullanımlık
    doctor_approval_expires_at = NOW()
  WHERE id = v_wo_id;

  -- design_qc_checks'i de güncelle (varsa)
  UPDATE design_qc_checks SET
    doctor_approved    = p_approved,
    doctor_approved_at = NOW(),
    doctor_note        = p_note
  WHERE work_order_id = v_wo_id;

  -- Onay → CAM'e geç. Red → DESIGN'a geri (önceki stage)
  IF p_approved THEN
    PERFORM advance_to_next_stage(v_wo_id, NULL);
  ELSE
    -- DESIGN'a geri dön: status='asamada', önceki stage'i tekrar aktive et
    UPDATE work_orders SET
      status        = 'asamada',
      rework_count  = COALESCE(rework_count, 0) + 1
    WHERE id = v_wo_id;
    -- En son DESIGN stage'ini tekrar aktife al
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

-- ── 4. Timeout cron — 48h geçen pending'leri auto-CAM ───────────────────────

CREATE OR REPLACE FUNCTION sweep_doctor_approval_timeouts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM work_orders
    WHERE doctor_approval_status = 'pending'
      AND doctor_approval_expires_at <= NOW()
  LOOP
    UPDATE work_orders SET
      doctor_approval_status = 'timeout',
      doctor_approval_token  = NULL
    WHERE id = r.id;

    PERFORM advance_to_next_stage(r.id, NULL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. pg_cron — saatlik tarama (eğer extension varsa) ──────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('doctor-approval-timeout');
    PERFORM cron.schedule(
      'doctor-approval-timeout',
      '*/15 * * * *',     -- her 15 dakikada bir
      $$SELECT sweep_doctor_approval_timeouts();$$
    );
  END IF;
END $$;
