-- ============================================================
-- 035 — profiles RLS sonsuz recursion düzeltmesi
--
-- Sorun:
--   033'te eklenen "clinic_admin_view_clinic_profiles" policy'si
--   profiles tablosu üstünde, içinde profiles'tan SELECT yapıyordu.
--   Bu alt-sorgu profiles RLS'ini tekrar tetikliyor → sonsuz döngü:
--
--     "infinite recursion detected in policy for relation profiles"
--
--   Aynı anti-pattern work_orders policy'lerinde de var
--   (JOIN profiles p_doc ... / JOIN profiles p_self).
--
-- Çözüm:
--   SECURITY DEFINER helper fonksiyonları (mevcut get_my_lab_id ve
--   is_lab_user pattern'i gibi). Bu fonksiyonlar RLS'i bypass ederek
--   auth.uid() için tek satır döndürür → recursion yok.
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Helper functions (SECURITY DEFINER → RLS bypass)
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

COMMENT ON FUNCTION is_clinic_admin() IS
  'RLS-safe: auth.uid() clinic_admin mi? SECURITY DEFINER ile profiles RLS bypass.';
COMMENT ON FUNCTION my_clinic_id() IS
  'RLS-safe: auth.uid()''in clinic_id''si. SECURITY DEFINER ile profiles RLS bypass.';

-- ──────────────────────────────────────────────────────────────
-- 2. profiles — clinic_admin kendi kliniğindeki hekimleri görsün
--    (recursion'lu eski policy yerine)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS clinic_admin_view_clinic_profiles ON profiles;
CREATE POLICY clinic_admin_view_clinic_profiles
  ON profiles
  FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND my_clinic_id() = profiles.clinic_id
  );

-- ──────────────────────────────────────────────────────────────
-- 3. work_orders — clinic_admin policy'lerini güvenli sürümle değiştir
-- ──────────────────────────────────────────────────────────────

-- 3a. SELECT
DROP POLICY IF EXISTS clinic_admin_view_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_view_clinic_orders
  ON work_orders
  FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p_doc
      WHERE p_doc.id = work_orders.doctor_id
        AND p_doc.clinic_id = my_clinic_id()
    )
  );

-- 3b. INSERT
DROP POLICY IF EXISTS clinic_admin_insert_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_insert_clinic_orders
  ON work_orders
  FOR INSERT
  WITH CHECK (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p_doc
      WHERE p_doc.id = work_orders.doctor_id
        AND p_doc.clinic_id = my_clinic_id()
    )
  );

-- 3c. UPDATE
DROP POLICY IF EXISTS clinic_admin_update_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_update_clinic_orders
  ON work_orders
  FOR UPDATE
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
-- 4. my_clinic_doctors view — SECURITY DEFINER fonksiyon kullansın
--    (recursion olmasın)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW my_clinic_doctors AS
SELECT p.id, p.full_name, p.phone, p.avatar_url, p.is_active, p.clinic_id, c.name AS clinic_name
  FROM profiles p
  LEFT JOIN clinics c ON c.id = p.clinic_id
 WHERE p.user_type = 'doctor'
   AND p.clinic_id IS NOT NULL
   AND p.clinic_id = my_clinic_id();

-- ============================================================
-- END OF 035
-- ============================================================
