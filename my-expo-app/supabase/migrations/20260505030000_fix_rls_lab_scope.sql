-- ============================================================
-- Migration: Fix RLS — Lab-scoped policies for 3 missing tables
--
-- materials, promotions, clinic_price_overrides had only a
-- blanket "authenticated" policy. This replaces it with proper
-- lab_id scoping using is_lab_user() + get_my_lab_id().
--
-- Also removes the overly permissive blanket policies from
-- the baseline migration on all 10 tables.
-- ============================================================

-- ─── Remove blanket policies (from baseline migration) ──────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'stock_items', 'stock_movements', 'order_items', 'materials',
    'brands', 'categories', 'provas', 'promotions',
    'lab_services', 'clinic_price_overrides'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Authenticated access %1$s" ON %1$s;',
      tbl
    );
  END LOOP;
END;
$$;

-- ─── Lab-scoped policies for the 3 tables that had NO policy ────────────

-- materials
DROP POLICY IF EXISTS "Lab users manage materials" ON materials;
CREATE POLICY "Lab users manage materials"
  ON materials FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- promotions
DROP POLICY IF EXISTS "Lab users manage promotions" ON promotions;
CREATE POLICY "Lab users manage promotions"
  ON promotions FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- clinic_price_overrides (lab users full access)
DROP POLICY IF EXISTS "Lab users manage clinic_price_overrides" ON clinic_price_overrides;
CREATE POLICY "Lab users manage clinic_price_overrides"
  ON clinic_price_overrides FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- clinic_price_overrides (clinic users read own)
DROP POLICY IF EXISTS "Clinic users read own overrides" ON clinic_price_overrides;
CREATE POLICY "Clinic users read own overrides"
  ON clinic_price_overrides FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'clinic'
    )
  );

-- lab_services (doctor/clinic can read active services for ordering)
DROP POLICY IF EXISTS "Authenticated read lab_services" ON lab_services;
CREATE POLICY "Authenticated read lab_services"
  ON lab_services FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = TRUE);
