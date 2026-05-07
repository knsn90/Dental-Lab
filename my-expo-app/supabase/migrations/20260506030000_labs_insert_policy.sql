-- ──────────────────────────────────────────────────────────────────
-- Wizard onboarding için labs INSERT/UPDATE RLS politikaları
--
-- Sorun: 012_multi_tenancy.sql sadece SELECT policy ekliyor;
--        INSERT policy olmadığı için yeni lab oluşturmak engellendi.
-- Çözüm: owner_id = auth.uid() ile INSERT, sahip/üye için UPDATE.
-- ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can create their own lab" ON labs;
CREATE POLICY "Users can create their own lab"
  ON labs FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update their lab" ON labs;
CREATE POLICY "Owners can update their lab"
  ON labs FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR id = get_my_lab_id())
  WITH CHECK (owner_id = auth.uid() OR id = get_my_lab_id());
