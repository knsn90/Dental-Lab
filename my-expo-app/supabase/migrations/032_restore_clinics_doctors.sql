-- ============================================================
-- 032 — Klinikler & Hekimler Tabloları Geri Yükleme
-- clinics ve doctors tabloları silinmişse bu migration'ı çalıştır.
-- Idempotent: IF NOT EXISTS kullanıldığı için güvenle tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. CLINICS TABLOSU
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinics (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  category       TEXT        CHECK (category IN ('klinik', 'poliklinik', 'hastane')),
  address        TEXT,
  phone          TEXT,
  email          TEXT,
  contact_person TEXT,
  notes          TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  lab_id         UUID        REFERENCES labs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 2. DOCTORS TABLOSU
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  UUID        REFERENCES clinics(id),
  full_name  TEXT        NOT NULL,
  phone      TEXT,
  specialty  TEXT,
  notes      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  lab_id     UUID        REFERENCES labs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 3. PERFORMANS İNDEKSLERİ
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clinics_lab_id ON clinics(lab_id);
CREATE INDEX IF NOT EXISTS idx_clinics_name   ON clinics(name);
CREATE INDEX IF NOT EXISTS idx_doctors_lab_id  ON doctors(lab_id);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic  ON doctors(clinic_id);

-- ──────────────────────────────────────────────────────────────
-- 4. UPDATED_AT OTOMATİK GÜNCELLEME TRİGGERLERİ
-- ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS clinics_updated_at ON clinics;
CREATE TRIGGER clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS doctors_updated_at ON doctors;
CREATE TRIGGER doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 5. AUTO-SET LAB_ID TRİGGERLERİ (INSERT sırasında otomatik atar)
-- ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS clinics_auto_lab_id ON clinics;
CREATE TRIGGER clinics_auto_lab_id
  BEFORE INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

DROP TRIGGER IF EXISTS doctors_auto_lab_id ON doctors;
CREATE TRIGGER doctors_auto_lab_id
  BEFORE INSERT ON doctors
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

-- ──────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

-- Klinikler: lab kullanıcıları tam yönetim
DROP POLICY IF EXISTS "Lab users manage clinics" ON clinics;
CREATE POLICY "Lab users manage clinics"
  ON clinics FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- Klinikler: doktorlar kendi lab'larındaki klinikleri görebilir
DROP POLICY IF EXISTS "doctor_view_clinics_in_lab" ON clinics;
CREATE POLICY "doctor_view_clinics_in_lab"
  ON clinics FOR SELECT
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'doctor'
    )
  );

-- Hekimler: lab kullanıcıları tam yönetim
DROP POLICY IF EXISTS "Lab users manage doctors" ON doctors;
CREATE POLICY "Lab users manage doctors"
  ON doctors FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 7. AKTİVİTE LOG TRİGGERLERİ (014 migration'ından)
-- ──────────────────────────────────────────────────────────────

-- Klinik log fonksiyonları
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

-- Hekim log fonksiyonları
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

-- ──────────────────────────────────────────────────────────────
-- 8. MEVCUT TABLOLARI lab_id İLE GÜNCELLE (ilişkili FK'lar varsa)
--    invoices.clinic_id ve invoices.doctor_id artık var olan tablolara işaret eder.
--    Bu migration sadece tablo oluşturma aşamasında çalışır;
--    mevcut FK'ların düzgün çalışması için invoices tablosu da kontrol edilmeli.
-- ──────────────────────────────────────────────────────────────

-- invoices tablosundaki FK'ların kliniklere doğru işaret etmesi için
-- (eğer invoices tablosu mevcutsa ve FK yoksa ekle)
DO $$
BEGIN
  -- invoices.clinic_id FK
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'invoices' AND ccu.column_name = 'clinic_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    BEGIN
      ALTER TABLE invoices ADD CONSTRAINT invoices_clinic_id_fkey
        FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  -- invoices.doctor_id FK
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'invoices' AND ccu.column_name = 'doctor_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    BEGIN
      ALTER TABLE invoices ADD CONSTRAINT invoices_doctor_id_fkey
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;
