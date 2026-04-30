-- ─────────────────────────────────────────────────────────────────────────────
-- 046 — QC Reject + Return-to-Stage
-- ─────────────────────────────────────────────────────────────────────────────
--   * return_to_stage(work_order_id, to_stage, reason, rejected_by)
--     - reject_log'a kaydeder
--     - rework_count++
--     - Önceki owner'ı (stage_log) bulur, yoksa auto_assign_user_for_stage
--     - Eski 'tamamlandi' stage'leri pasifleştirir, yeni 'aktif' stage insert eder
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION return_to_stage(
  p_work_order_id UUID,
  p_to_stage      TEXT,
  p_reason        TEXT,
  p_rejected_by   UUID
) RETURNS JSONB AS $$
DECLARE
  v_from_stage   TEXT;
  v_owner_id     UUID;
  v_lab_id       UUID;
  v_station_id   UUID;
  v_max_seq      INTEGER;
  v_new_stage_id UUID;
BEGIN
  -- 1. Reddeden iş emrinin mevcut stage'ini al (audit için)
  SELECT
    UPPER(COALESCE(ls.name, wo.status::text)),
    COALESCE(p.lab_id, p.id)
  INTO v_from_stage, v_lab_id
  FROM work_orders wo
  LEFT JOIN order_stages os ON os.id = wo.current_stage_id
  LEFT JOIN lab_stations  ls ON ls.id = os.station_id
  LEFT JOIN profiles      p  ON p.id  = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  -- 2. reject_log
  INSERT INTO reject_log (work_order_id, from_stage, to_stage, reason, rejected_by)
  VALUES (p_work_order_id, COALESCE(v_from_stage, '?'), p_to_stage, p_reason, p_rejected_by);

  -- 3. rework_count++
  UPDATE work_orders SET rework_count = COALESCE(rework_count, 0) + 1
  WHERE id = p_work_order_id;

  -- 4. Önceki owner — stage_log'dan o stage'i en son tamamlayan
  SELECT owner_id INTO v_owner_id
  FROM stage_log
  WHERE work_order_id = p_work_order_id
    AND stage = p_to_stage
    AND owner_id IS NOT NULL
  ORDER BY end_time DESC NULLS LAST, start_time DESC
  LIMIT 1;

  -- Fallback: auto_assign
  IF v_owner_id IS NULL AND v_lab_id IS NOT NULL THEN
    v_owner_id := auto_assign_user_for_stage(p_to_stage, v_lab_id);
  END IF;

  -- 5. Hedef stage'in lab_station eşleşmesini bul (isim ILIKE)
  SELECT id INTO v_station_id
  FROM lab_stations
  WHERE lab_profile_id = v_lab_id
    AND UPPER(name) = p_to_stage
    AND is_active = TRUE
  LIMIT 1;

  -- 6. Mevcut aktif stage'leri kapat
  UPDATE order_stages SET status = 'reddedildi'
  WHERE work_order_id = p_work_order_id
    AND status IN ('aktif', 'tamamlandi');

  -- 7. Yeni rework stage'i (sequence_order = max+1)
  SELECT COALESCE(MAX(sequence_order), 0) + 1 INTO v_max_seq
  FROM order_stages WHERE work_order_id = p_work_order_id;

  INSERT INTO order_stages (
    work_order_id, station_id, technician_id, sequence_order,
    is_critical, status, assigned_at, manager_note
  ) VALUES (
    p_work_order_id, v_station_id, v_owner_id, v_max_seq,
    FALSE, 'aktif', NOW(), 'REWORK: ' || p_reason
  )
  RETURNING id INTO v_new_stage_id;

  -- 8. work_orders → asamada + current_stage_id
  UPDATE work_orders SET
    status           = 'asamada',
    current_stage_id = v_new_stage_id
  WHERE id = p_work_order_id;

  -- 9. stage_log
  INSERT INTO stage_log (work_order_id, stage, owner_id, start_time, reworked, notes)
  VALUES (p_work_order_id, p_to_stage, v_owner_id, NOW(), TRUE, 'Rework: ' || p_reason);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'new_stage_id', v_new_stage_id,
    'owner_id',     v_owner_id,
    'reworked_to',  p_to_stage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
