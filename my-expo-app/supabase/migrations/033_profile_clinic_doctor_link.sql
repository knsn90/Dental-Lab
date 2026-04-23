-- ============================================================
-- 033 — Profile ↔ Clinic / Doctor İlişkilendirme
-- Hekim login'i (auth.users / profiles) ile `doctors` ve `clinics`
-- tabloları arasında net bir bağ olmadığı için, hekimin kendi
-- faturalarını/cari bakiyesini görmesi mümkün değildi.
--
-- Bu migration:
--   • profiles tablosuna clinic_id + doctor_id ekler
--   • handle_new_user trigger'ına meta-data üzerinden set etmeyi ekler
--   • RLS: hekimler kendi kliniklerinin faturalarını/ödemelerini
--     SELECT edebilir; kendi klinik/doktor kaydını güncelleyebilir.
-- Idempotent — birden fazla çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES: clinic_id + doctor_id kolonları
-- ──────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id  ON profiles(clinic_id);
CREATE INDEX IF NOT EXISTS idx_profiles_doctor_id  ON profiles(doctor_id);

-- ──────────────────────────────────────────────────────────────
-- 2. handle_new_user genişlet: user_metadata'dan clinic_id / doctor_id
--    okunabilsin (opsiyonel).  Kayıt tamamlandıktan sonra
--    auth.api.signUpDoctor ayrıca update eder.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := NEW.raw_user_meta_data->>'user_type';

  INSERT INTO profiles (
    id, user_type, full_name, clinic_name, role, phone,
    is_active, approval_status, clinic_id, doctor_id
  )
  VALUES (
    NEW.id,
    v_user_type,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'clinic_name',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN v_user_type = 'doctor' THEN false ELSE true END,
    CASE WHEN v_user_type = 'doctor' THEN 'pending' ELSE 'approved' END,
    NULLIF(NEW.raw_user_meta_data->>'clinic_id','')::UUID,
    NULLIF(NEW.raw_user_meta_data->>'doctor_id','')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ──────────────────────────────────────────────────────────────
-- 3. Yardımcı SECURITY DEFINER fonksiyonları
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_clinic_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_doctor_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT doctor_id FROM profiles WHERE id = auth.uid()
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS: HEKİM → KENDİ KLİNİK/DOKTOR KAYDINI GÖR+GÜNCELLE
-- ──────────────────────────────────────────────────────────────

-- Hekim kendi klinik kaydını güncelleyebilir (isim/telefon/adres vs)
DROP POLICY IF EXISTS "doctor_update_own_clinic" ON clinics;
CREATE POLICY "doctor_update_own_clinic"
  ON clinics FOR UPDATE
  USING (
    id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  )
  WITH CHECK (
    id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  );

-- Hekim kendi klinik altındaki hekimleri görür
DROP POLICY IF EXISTS "doctor_view_doctors_same_clinic" ON doctors;
CREATE POLICY "doctor_view_doctors_same_clinic"
  ON doctors FOR SELECT
  USING (
    clinic_id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  );

-- Hekim kendi klinik altında yeni hekim ekleyebilir / güncelleyebilir
DROP POLICY IF EXISTS "doctor_insert_doctors_same_clinic" ON doctors;
CREATE POLICY "doctor_insert_doctors_same_clinic"
  ON doctors FOR INSERT
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  );

DROP POLICY IF EXISTS "doctor_update_doctors_same_clinic" ON doctors;
CREATE POLICY "doctor_update_doctors_same_clinic"
  ON doctors FOR UPDATE
  USING (
    clinic_id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  )
  WITH CHECK (
    clinic_id = get_my_clinic_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
  );

-- ──────────────────────────────────────────────────────────────
-- 5. RLS: HEKİM → KENDİ KLİNİĞİNİN FATURALARI / ÖDEMELERİ (READ-ONLY)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoices') THEN
    EXECUTE $ddl$
      DROP POLICY IF EXISTS "doctor_view_own_clinic_invoices" ON invoices;
      CREATE POLICY "doctor_view_own_clinic_invoices"
        ON invoices FOR SELECT
        USING (
          clinic_id = get_my_clinic_id()
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
        );
    $ddl$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoice_items') THEN
    EXECUTE $ddl$
      DROP POLICY IF EXISTS "doctor_view_own_clinic_invoice_items" ON invoice_items;
      CREATE POLICY "doctor_view_own_clinic_invoice_items"
        ON invoice_items FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM invoices inv
            WHERE inv.id = invoice_items.invoice_id
              AND inv.clinic_id = get_my_clinic_id()
          )
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
        );
    $ddl$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments') THEN
    EXECUTE $ddl$
      DROP POLICY IF EXISTS "doctor_view_own_clinic_payments" ON payments;
      CREATE POLICY "doctor_view_own_clinic_payments"
        ON payments FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM invoices inv
            WHERE inv.id = payments.invoice_id
              AND inv.clinic_id = get_my_clinic_id()
          )
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type='doctor')
        );
    $ddl$;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 6. GERİYE DÖNÜK EŞLEŞTİRME:
--    Daha önce kaydolan hekimlerin (clinic_id / doctor_id boş)
--    profile kayıtlarını mevcut verilere göre doldurmayı dener.
--    Eşleşme: profile.full_name + profile.phone → doctors
--    veya    profile.clinic_name → clinics.name
-- ──────────────────────────────────────────────────────────────
UPDATE profiles p
SET    clinic_id = c.id
FROM   clinics c
WHERE  p.user_type = 'doctor'
  AND  p.clinic_id IS NULL
  AND  p.clinic_name IS NOT NULL
  AND  lower(trim(c.name)) = lower(trim(p.clinic_name));

UPDATE profiles p
SET    doctor_id = d.id
FROM   doctors d
WHERE  p.user_type = 'doctor'
  AND  p.doctor_id IS NULL
  AND  d.full_name = p.full_name
  AND  ( (p.phone IS NULL AND d.phone IS NULL) OR d.phone = p.phone )
  AND  ( p.clinic_id IS NULL OR d.clinic_id = p.clinic_id );
