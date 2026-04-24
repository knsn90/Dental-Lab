-- ============================================================
-- 033 — Klinik Paneli (çoklu hekim klinikler için)
--
-- Eklenenler:
--   1. user_type CHECK constraint: 'clinic_admin' eklendi
--   2. profiles.clinic_id UUID sütunu (clinics.id'ye referans)
--   3. auth.users meta'dan clinic_id okuyan trigger güncellemesi
--   4. RLS: clinic_admin kendi kliniğindeki hekimleri ve onların siparişlerini
--      görebilsin; bireysel hekim davranışı değişmeden kalır
--
-- Idempotent: istediğin kadar tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. user_type CHECK constraint'ini güncelle
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Eski constraint'i düşür (isim nedeni ile varsa)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_type_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_user_type_check;
  END IF;

  -- Yeni permissive constraint
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_user_type_check
    CHECK (user_type IN ('lab', 'doctor', 'admin', 'clinic_admin'));
END$$;

-- ──────────────────────────────────────────────────────────────
-- 2. clinic_id sütunu (null olabilir — bireysel hekimler için)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON profiles(clinic_id);

COMMENT ON COLUMN profiles.clinic_id IS
  'Klinik müdürü ve çoklu hekimli klinikte çalışan hekimler için clinic.id referansı. Bireysel çalışan hekimler için NULL kalır.';

-- ──────────────────────────────────────────────────────────────
-- 3. Auth trigger — yeni kullanıcının metadata'sından clinic_id oku
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  -- raw_user_meta_data->>'clinic_id' bir UUID ise ona çevir, değilse NULL
  BEGIN
    v_clinic_id := NULLIF(NEW.raw_user_meta_data->>'clinic_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_clinic_id := NULL;
  END;

  INSERT INTO profiles (
    id, user_type, full_name, clinic_name, clinic_id,
    role, phone, is_active, approval_status, lab_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'doctor'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'clinic_name',
    v_clinic_id,
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'phone',
    COALESCE((NEW.raw_user_meta_data->>'is_active')::BOOLEAN, TRUE),
    COALESCE(NEW.raw_user_meta_data->>'approval_status', 'pending'),
    NULLIF(NEW.raw_user_meta_data->>'lab_id', '')::UUID
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger zaten 001/006/012 migration'larında var — CREATE OR REPLACE yeter

-- ──────────────────────────────────────────────────────────────
-- 4. RLS — clinic_admin yetkileri
-- ──────────────────────────────────────────────────────────────

-- 4a. profiles: clinic_admin kendi kliniğindeki hekim kayıtlarını görebilsin
DROP POLICY IF EXISTS clinic_admin_view_clinic_profiles ON profiles;
CREATE POLICY clinic_admin_view_clinic_profiles
  ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p_self
      WHERE p_self.id = auth.uid()
        AND p_self.user_type = 'clinic_admin'
        AND p_self.clinic_id IS NOT NULL
        AND p_self.clinic_id = profiles.clinic_id
    )
  );

-- 4b. work_orders: clinic_admin kendi kliniğindeki tüm hekimlerin siparişlerini görebilsin
DROP POLICY IF EXISTS clinic_admin_view_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_view_clinic_orders
  ON work_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p_self
      JOIN profiles p_doc ON p_doc.id = work_orders.doctor_id
      WHERE p_self.id = auth.uid()
        AND p_self.user_type = 'clinic_admin'
        AND p_self.clinic_id IS NOT NULL
        AND p_self.clinic_id = p_doc.clinic_id
    )
  );

-- 4c. work_orders: clinic_admin kendi kliniğinin hekimleri adına sipariş oluşturabilsin
DROP POLICY IF EXISTS clinic_admin_insert_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_insert_clinic_orders
  ON work_orders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles p_self
      JOIN profiles p_doc ON p_doc.id = work_orders.doctor_id
      WHERE p_self.id = auth.uid()
        AND p_self.user_type = 'clinic_admin'
        AND p_self.clinic_id IS NOT NULL
        AND p_self.clinic_id = p_doc.clinic_id
    )
  );

-- 4d. work_orders: clinic_admin kendi kliniğinin siparişlerini güncelleyebilsin
--     (not: iptal / tarih değişikliği gibi — statü değişikliği lab'a ait)
DROP POLICY IF EXISTS clinic_admin_update_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_update_clinic_orders
  ON work_orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p_self
      JOIN profiles p_doc ON p_doc.id = work_orders.doctor_id
      WHERE p_self.id = auth.uid()
        AND p_self.user_type = 'clinic_admin'
        AND p_self.clinic_id IS NOT NULL
        AND p_self.clinic_id = p_doc.clinic_id
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 5. Helper view — klinik müdürünün kendi kliniğindeki hekimler
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW my_clinic_doctors AS
SELECT p.id, p.full_name, p.phone, p.avatar_url, p.is_active, p.clinic_id, c.name AS clinic_name
  FROM profiles p
  LEFT JOIN clinics c ON c.id = p.clinic_id
 WHERE p.user_type = 'doctor'
   AND p.clinic_id IS NOT NULL
   AND p.clinic_id = (
     SELECT clinic_id FROM profiles
     WHERE id = auth.uid()
     LIMIT 1
   );

COMMENT ON VIEW my_clinic_doctors IS
  'auth.uid() klinik müdürü ise kendi kliniğindeki aktif hekimleri döner. RLS otomatik uygulanır.';

-- ============================================================
-- END OF 033
-- ============================================================
