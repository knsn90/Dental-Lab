-- ============================================================
-- Activity Logs — Eylem kayıt sistemi
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name   TEXT        NOT NULL DEFAULT 'Sistem',
  actor_type   TEXT        NOT NULL DEFAULT 'lab',  -- 'admin' | 'lab' | 'doctor'
  action       TEXT        NOT NULL,
  entity_type  TEXT,                                -- 'work_order' | 'profile' | 'status'
  entity_id    UUID,
  entity_label TEXT,                               -- ör: sipariş no, kişi adı
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_actor_type  ON activity_logs (actor_type);
CREATE INDEX IF NOT EXISTS idx_logs_created_at  ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_actor_id    ON activity_logs (actor_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Sadece adminler okuyabilir
CREATE POLICY "admin_select_logs" ON activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Trigger fonksiyonları SECURITY DEFINER olduğu için RLS'yi bypass eder.
-- Yine de açık bir INSERT policy ekliyoruz.
CREATE POLICY "system_insert_logs" ON activity_logs
  FOR INSERT WITH CHECK (true);

-- ── TRIGGER FUNCTIONS ─────────────────────────────────────────────────────────

-- 1. Yeni profil oluşturulduğunda (hesap kaydı)
CREATE OR REPLACE FUNCTION log_profile_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label
  ) VALUES (
    NEW.id,
    COALESCE(NEW.full_name, 'Yeni Kullanıcı'),
    COALESCE(NEW.user_type, 'lab'),
    CASE NEW.user_type
      WHEN 'doctor' THEN 'Hekim hesabı oluşturuldu'
      WHEN 'admin'  THEN 'Admin hesabı oluşturuldu'
      ELSE               'Lab kullanıcısı oluşturuldu'
    END,
    'profile', NEW.id, NEW.full_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_profile_created ON profiles;
CREATE TRIGGER trg_log_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_created();

-- 2. Profil güncellendiğinde (ad, telefon, klinik, aktif/pasif)
CREATE OR REPLACE FUNCTION log_profile_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
BEGIN
  -- Sadece anlamlı değişiklikleri logla
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    v_action := CASE WHEN NEW.is_active
      THEN 'Hesap aktif edildi'
      ELSE 'Hesap pasif edildi'
    END;
  ELSIF OLD.full_name   IS DISTINCT FROM NEW.full_name
     OR OLD.phone       IS DISTINCT FROM NEW.phone
     OR OLD.clinic_name IS DISTINCT FROM NEW.clinic_name
     OR OLD.role        IS DISTINCT FROM NEW.role THEN
    v_action := 'Profil bilgileri güncellendi';
  ELSE
    RETURN NEW;  -- Sadece updated_at değişti, loglamaya gerek yok
  END IF;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label
  ) VALUES (
    NEW.id,
    NEW.full_name,
    NEW.user_type,
    v_action,
    'profile', NEW.id, NEW.full_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_profile_updated ON profiles;
CREATE TRIGGER trg_log_profile_updated
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_updated();

-- 3. Yeni iş emri oluşturulduğunda
CREATE OR REPLACE FUNCTION log_work_order_created()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_type TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type
  FROM profiles WHERE id = NEW.doctor_id;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label
  ) VALUES (
    NEW.doctor_id,
    COALESCE(v_name, 'Bilinmeyen'),
    COALESCE(v_type, 'doctor'),
    'İş emri oluşturdu',
    'work_order', NEW.id, NEW.order_number
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_work_order_created ON work_orders;
CREATE TRIGGER trg_log_work_order_created
  AFTER INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION log_work_order_created();

-- 4. Sipariş durumu değiştirildiğinde
CREATE OR REPLACE FUNCTION log_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_name      TEXT;
  v_type      TEXT;
  v_order_num TEXT;
  v_label     TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type
  FROM profiles WHERE id = NEW.changed_by;

  SELECT order_number INTO v_order_num
  FROM work_orders WHERE id = NEW.work_order_id;

  v_label := CASE NEW.new_status
    WHEN 'alindi'           THEN 'Alındı'
    WHEN 'uretimde'         THEN 'Üretimde'
    WHEN 'kalite_kontrol'   THEN 'Kalite Kontrol'
    WHEN 'teslimata_hazir'  THEN 'Teslimata Hazır'
    WHEN 'teslim_edildi'    THEN 'Teslim Edildi'
    ELSE NEW.new_status::TEXT
  END;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    NEW.changed_by,
    COALESCE(v_name, 'Bilinmeyen'),
    COALESCE(v_type, 'lab'),
    'Durumu değiştirdi → ' || v_label,
    'work_order', NEW.work_order_id, v_order_num,
    jsonb_build_object(
      'old_status', NEW.old_status::TEXT,
      'new_status', NEW.new_status::TEXT
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_status_changed ON status_history;
CREATE TRIGGER trg_log_status_changed
  AFTER INSERT ON status_history
  FOR EACH ROW EXECUTE FUNCTION log_status_changed();
