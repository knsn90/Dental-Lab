-- ============================================================
-- 034 — work_orders INSERT RLS düzeltmesi
--
-- Sorun:
--   012_multi_tenancy.sql'de sadece "Doctors can create orders" INSERT
--   politikası var; lab, admin ve clinic_admin için INSERT politikası yok.
--   Bu nedenle bu kullanıcılar yeni iş emri oluşturmaya çalıştığında:
--     "new row violates row-level security policy for table work_orders"
--
--   Ayrıca doctor politikası lab_id = get_my_lab_id() zorunlu tutuyor;
--   profile.lab_id NULL ise INSERT başarısız oluyordu.
--
-- Çözüm:
--   1. Lab + admin için INSERT politikası ekle
--   2. clinic_admin politikasını (033) tekrar garanti altına al
--   3. Doctor politikasını esnet: lab_id NULL ise backend trigger dolduracak
--
-- Idempotent: istediğin kadar tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. LAB kullanıcıları iş emri oluşturabilsin
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lab users can create orders" ON work_orders;
CREATE POLICY "Lab users can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND user_type IN ('lab', 'admin')
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 2. CLINIC ADMIN kullanıcıları kendi kliniğinin hekimleri adına
--    iş emri oluşturabilsin (033 migration garantili olarak yeniden
--    uygulanır; profiles.clinic_id sütunu varsa çalışır)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'clinic_id'
  ) THEN
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
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────
-- 3. DOCTOR INSERT politikası esnetilir — lab_id NULL ise trigger
--    dolduracağı için hem NULL hem de get_my_lab_id() eşleşen
--    satırlara izin verilir
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Doctors can create orders" ON work_orders;
CREATE POLICY "Doctors can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'doctor'
    )
    AND (
      -- Çok-kiracılı aktifse ve kullanıcının lab_id'si varsa uyumlu olmalı
      lab_id IS NULL
      OR lab_id = get_my_lab_id()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 4. Lab kullanıcıları update yetkisi (012'de vardı, garanti)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lab users can update orders" ON work_orders;
CREATE POLICY "Lab users can update orders"
  ON work_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND user_type IN ('lab', 'admin')
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 5. SELECT: admin her siparişi görebilsin (012'de sadece lab için var)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin sees all orders" ON work_orders;
CREATE POLICY "Admin sees all orders"
  ON work_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- ============================================================
-- END OF 034
-- ============================================================
