-- ============================================================
-- 036 — work_orders RLS policy'lerini sıfırdan temiz kur
--
-- 033/034/035 migration'larının çıktısı ne olursa olsun bu migration
-- work_orders üzerindeki TÜM policy'leri düşürür ve temiz baştan kurar.
-- Lab, admin, doctor ve clinic_admin — hepsinin INSERT/SELECT/UPDATE
-- yetkileri net bir şekilde tanımlanır.
--
-- Kritik değişiklik: Önceki policy'lerdeki lab_id = get_my_lab_id()
-- zorunluluğu kaldırıldı. Profile.lab_id NULL olan kullanıcılar da
-- artık sipariş oluşturabilir (auto_set_lab_id trigger dolduracak).
--
-- Idempotent: istediğin kadar tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. HELPER FUNCTIONS (SECURITY DEFINER — RLS bypass, no recursion)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_clinic_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND user_type = 'clinic_admin'
  );
$$;

CREATE OR REPLACE FUNCTION my_clinic_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_user_type()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT user_type::text FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────
-- 1. TÜM ESKİ WORK_ORDERS POLICY'LERİNİ DÜŞÜR
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Doctors see own orders"              ON work_orders;
DROP POLICY IF EXISTS "Lab users see all orders"            ON work_orders;
DROP POLICY IF EXISTS "Admin sees all orders"               ON work_orders;
DROP POLICY IF EXISTS "Doctors can create orders"           ON work_orders;
DROP POLICY IF EXISTS "Lab users can create orders"         ON work_orders;
DROP POLICY IF EXISTS "Lab users can update orders"         ON work_orders;
DROP POLICY IF EXISTS "Lab users can delete orders"         ON work_orders;
DROP POLICY IF EXISTS clinic_admin_view_clinic_orders       ON work_orders;
DROP POLICY IF EXISTS clinic_admin_insert_clinic_orders     ON work_orders;
DROP POLICY IF EXISTS clinic_admin_update_clinic_orders     ON work_orders;

-- ──────────────────────────────────────────────────────────────
-- 2. SELECT POLICY'LERİ
-- ──────────────────────────────────────────────────────────────

-- Doktor: kendi siparişlerini görür
CREATE POLICY "Doctors see own orders"
  ON work_orders FOR SELECT
  USING (doctor_id = auth.uid());

-- Lab ve admin: tüm siparişler
CREATE POLICY "Lab users see all orders"
  ON work_orders FOR SELECT
  USING (my_user_type() IN ('lab', 'admin'));

-- Klinik müdürü: kendi kliniğinin hekimlerinin siparişleri
CREATE POLICY clinic_admin_view_clinic_orders
  ON work_orders FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p_doc
      WHERE p_doc.id = work_orders.doctor_id
        AND p_doc.clinic_id = my_clinic_id()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 3. INSERT POLICY'LERİ — hepsi OR ile birleşir
-- ──────────────────────────────────────────────────────────────

-- Lab + admin: her türlü iş emri oluşturabilir
CREATE POLICY "Lab users can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (my_user_type() IN ('lab', 'admin'));

-- Doctor: sadece kendi adına
CREATE POLICY "Doctors can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND my_user_type() = 'doctor'
  );

-- Clinic admin: kendi kliniğinin hekimleri adına
CREATE POLICY clinic_admin_insert_clinic_orders
  ON work_orders FOR INSERT
  WITH CHECK (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p_doc
      WHERE p_doc.id = work_orders.doctor_id
        AND p_doc.clinic_id = my_clinic_id()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 4. UPDATE POLICY'LERİ
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Lab users can update orders"
  ON work_orders FOR UPDATE
  USING (my_user_type() IN ('lab', 'admin'));

CREATE POLICY clinic_admin_update_clinic_orders
  ON work_orders FOR UPDATE
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p_doc
      WHERE p_doc.id = work_orders.doctor_id
        AND p_doc.clinic_id = my_clinic_id()
    )
  );

-- ============================================================
-- END OF 036
-- ============================================================
