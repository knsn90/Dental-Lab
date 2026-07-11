-- ============================================================
-- P2a — Kalan blanket-sızıntı tablolarında kiracı izolasyonu (lab_id)
--
-- work_orders (P0) ile aynı desen: lab/admin "hepsini gör/yaz" politikaları
-- lab_id kontrol etmiyordu → çok-lab dünyasında sızıntı. Bu tablolar lab
-- kullanıcısı tarafından oluşturulur (lab_id = creator'ın lab'ı, dolu).
--
-- Kapsam: equipment, lab_shifts, stage_work_segments, user_stage_skills,
--         user_station_skills, activity_logs.
-- HARİÇ (P2b): order_cancellation_requests, order_change_requests,
--   support_tickets — lab_id iş emrinden türetilmeli (ayrı, dikkatli adım).
--
-- Güvenli (2026-07-11 canlı): tek lab; NULL lab_id yalnız equipment(7) +
-- activity_logs(86) → tek lab'a backfill. Diğerlerinde NULL yok.
-- Idempotent.
-- ============================================================

-- ── 0) Backfill: NULL lab_id → tek mevcut lab ──
DO $$
DECLARE v_lab uuid;
BEGIN
  SELECT id INTO v_lab FROM labs ORDER BY created_at LIMIT 1;
  IF v_lab IS NOT NULL THEN
    UPDATE equipment      SET lab_id = v_lab WHERE lab_id IS NULL;
    UPDATE activity_logs  SET lab_id = v_lab WHERE lab_id IS NULL;
  END IF;
END $$;

-- ── 1) auto_set_lab_id BEFORE INSERT trigger (eksik olanlara) ──
DROP TRIGGER IF EXISTS set_lab_id ON equipment;
CREATE TRIGGER set_lab_id BEFORE INSERT ON equipment
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
DROP TRIGGER IF EXISTS set_lab_id ON lab_shifts;
CREATE TRIGGER set_lab_id BEFORE INSERT ON lab_shifts
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
DROP TRIGGER IF EXISTS set_lab_id ON stage_work_segments;
CREATE TRIGGER set_lab_id BEFORE INSERT ON stage_work_segments
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
DROP TRIGGER IF EXISTS set_lab_id ON user_stage_skills;
CREATE TRIGGER set_lab_id BEFORE INSERT ON user_stage_skills
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
DROP TRIGGER IF EXISTS set_lab_id ON user_station_skills;
CREATE TRIGGER set_lab_id BEFORE INSERT ON user_station_skills
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

-- ── 2) Politikaları lab_id ile sıkılaştır (orijinal mantık korunur + AND lab_id) ──

-- equipment (ALL) — inline EXISTS yerine my_user_type() + lab_id
DROP POLICY IF EXISTS equipment_lab_access ON equipment;
CREATE POLICY equipment_lab_access ON equipment FOR ALL
  USING      (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id())
  WITH CHECK (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

-- lab_shifts
DROP POLICY IF EXISTS lab_shifts_select ON lab_shifts;
CREATE POLICY lab_shifts_select ON lab_shifts FOR SELECT
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = ANY (ARRAY['lab','admin'])));
DROP POLICY IF EXISTS lab_shifts_write ON lab_shifts;
CREATE POLICY lab_shifts_write ON lab_shifts FOR ALL
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))))
  WITH CHECK (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))));

-- stage_work_segments (SELECT)
DROP POLICY IF EXISTS work_segments_select ON stage_work_segments;
CREATE POLICY work_segments_select ON stage_work_segments FOR SELECT
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = ANY (ARRAY['lab','admin'])));

-- user_stage_skills
DROP POLICY IF EXISTS user_stage_skills_select ON user_stage_skills;
CREATE POLICY user_stage_skills_select ON user_stage_skills FOR SELECT
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = ANY (ARRAY['lab','admin'])));
DROP POLICY IF EXISTS user_stage_skills_write ON user_stage_skills;
CREATE POLICY user_stage_skills_write ON user_stage_skills FOR ALL
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))))
  WITH CHECK (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))));

-- user_station_skills
DROP POLICY IF EXISTS user_station_skills_select ON user_station_skills;
CREATE POLICY user_station_skills_select ON user_station_skills FOR SELECT
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = ANY (ARRAY['lab','admin'])));
DROP POLICY IF EXISTS user_station_skills_write ON user_station_skills;
CREATE POLICY user_station_skills_write ON user_station_skills FOR ALL
  USING (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))))
  WITH CHECK (lab_id = get_my_lab_id()
         AND auth.uid() IN (SELECT id FROM profiles
                            WHERE user_type = 'admin'
                               OR (user_type = 'lab' AND role = ANY (ARRAY['manager','admin']))));

-- activity_logs (SELECT) — admin yalnız KENDİ lab'ının loglarını görür
DROP POLICY IF EXISTS admin_select_logs ON activity_logs;
CREATE POLICY admin_select_logs ON activity_logs FOR SELECT
  USING (is_admin_user() AND lab_id = get_my_lab_id());

-- ============================================================
-- END — P2a tenant isolation
-- ============================================================
