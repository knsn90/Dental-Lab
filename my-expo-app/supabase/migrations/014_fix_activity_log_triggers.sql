-- ============================================================
-- 014 — Activity log trigger fixes + clinic/doctor triggers
-- Fixes: triggers now use auth.uid() as actor (who performed
-- the action), not the target record's own ID.
-- Adds:  clinic created/updated/deleted, doctor same.
-- ============================================================

-- ── 1. Fix log_profile_updated: actor = who made the change ──────────────────

CREATE OR REPLACE FUNCTION log_profile_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_action      TEXT;
  v_actor_id    UUID;
  v_actor_name  TEXT;
  v_actor_type  TEXT;
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
    RETURN NEW; -- Önemsiz değişiklik, loglama
  END IF;

  -- Kim yaptı?
  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL AND v_actor_id != NEW.id THEN
    -- Başka biri (admin) güncelledi
    SELECT full_name, user_type INTO v_actor_name, v_actor_type
    FROM profiles WHERE id = v_actor_id;
    v_action := v_action || ': ' || NEW.full_name;
  ELSE
    -- Kullanıcı kendini güncelledi
    v_actor_id   := NEW.id;
    v_actor_name := NEW.full_name;
    v_actor_type := NEW.user_type;
  END IF;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor_id,
    COALESCE(v_actor_name, 'Sistem'),
    COALESCE(v_actor_type, 'admin'),
    v_action,
    'profile', NEW.id, NEW.full_name,
    jsonb_build_object('target_user', NEW.full_name, 'target_type', NEW.user_type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2. Fix log_work_order_created: actor = auth.uid() (yaratan kişi) ─────────

CREATE OR REPLACE FUNCTION log_work_order_created()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id    UUID;
  v_actor_name  TEXT;
  v_actor_type  TEXT;
  v_doctor_name TEXT;
BEGIN
  v_actor_id := COALESCE(auth.uid(), NEW.doctor_id);

  SELECT full_name, user_type INTO v_actor_name, v_actor_type
  FROM profiles WHERE id = v_actor_id;

  -- Eğer admin yarattıysa hekim adını metadata'ya ekle
  IF v_actor_id IS DISTINCT FROM NEW.doctor_id THEN
    SELECT full_name INTO v_doctor_name FROM profiles WHERE id = NEW.doctor_id;
  END IF;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor_id,
    COALESCE(v_actor_name, 'Bilinmeyen'),
    COALESCE(v_actor_type, 'lab'),
    'İş emri oluşturdu',
    'work_order', NEW.id, NEW.order_number,
    CASE WHEN v_doctor_name IS NOT NULL
      THEN jsonb_build_object('doctor', v_doctor_name)
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 3. Klinik trigger'ları ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_clinic_created()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          'Klinik oluşturuldu: ' || NEW.name, 'clinic', NEW.id, NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_clinic_created ON clinics;
CREATE TRIGGER trg_log_clinic_created
  AFTER INSERT ON clinics FOR EACH ROW EXECUTE FUNCTION log_clinic_created();

-- --

CREATE OR REPLACE FUNCTION log_clinic_updated()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT; v_action TEXT;
BEGIN
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    v_action := CASE WHEN NEW.is_active THEN 'Klinik aktif edildi' ELSE 'Klinik pasif edildi' END;
  ELSE
    v_action := 'Klinik güncellendi';
  END IF;
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          v_action || ': ' || NEW.name, 'clinic', NEW.id, NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_clinic_updated ON clinics;
CREATE TRIGGER trg_log_clinic_updated
  AFTER UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION log_clinic_updated();

-- --

CREATE OR REPLACE FUNCTION log_clinic_deleted()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          'Klinik silindi: ' || OLD.name, 'clinic', OLD.id, OLD.name);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_clinic_deleted ON clinics;
CREATE TRIGGER trg_log_clinic_deleted
  BEFORE DELETE ON clinics FOR EACH ROW EXECUTE FUNCTION log_clinic_deleted();

-- ── 4. Hekim trigger'ları ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_doctor_created()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          'Hekim oluşturuldu: ' || NEW.full_name, 'doctor', NEW.id, NEW.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_doctor_created ON doctors;
CREATE TRIGGER trg_log_doctor_created
  AFTER INSERT ON doctors FOR EACH ROW EXECUTE FUNCTION log_doctor_created();

-- --

CREATE OR REPLACE FUNCTION log_doctor_updated()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT; v_action TEXT;
BEGIN
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    v_action := CASE WHEN NEW.is_active THEN 'Hekim aktif edildi' ELSE 'Hekim pasif edildi' END;
  ELSE
    v_action := 'Hekim bilgileri güncellendi';
  END IF;
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          v_action || ': ' || NEW.full_name, 'doctor', NEW.id, NEW.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_doctor_updated ON doctors;
CREATE TRIGGER trg_log_doctor_updated
  AFTER UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION log_doctor_updated();

-- --

CREATE OR REPLACE FUNCTION log_doctor_deleted()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT; v_type TEXT;
BEGIN
  SELECT full_name, user_type INTO v_name, v_type FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_logs (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label)
  VALUES (auth.uid(), COALESCE(v_name,'Sistem'), COALESCE(v_type,'admin'),
          'Hekim silindi: ' || OLD.full_name, 'doctor', OLD.id, OLD.full_name);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_doctor_deleted ON doctors;
CREATE TRIGGER trg_log_doctor_deleted
  BEFORE DELETE ON doctors FOR EACH ROW EXECUTE FUNCTION log_doctor_deleted();
