-- ─────────────────────────────────────────────────────────────────────────────
-- 041_lab_stations_rls_team.sql
-- lab_stations INSERT/UPDATE/DELETE politikalarını lab ekibine (yöneticiler,
-- teknisyenler) izin verecek şekilde genişletir.
--
-- Önceki politika (040) sadece lab_profile_id = auth.uid() olan kullanıcıya,
-- yani lab "sahibine" izin veriyordu. Lab altında kayıtlı çalışanların
-- (profile.lab_id = lab_profile_id) eklemesi/değiştirmesi başarısız oluyordu:
--   "new row violates row-level security policy for table lab_stations"
-- ─────────────────────────────────────────────────────────────────────────────

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lab_stations_insert ON lab_stations;

CREATE POLICY lab_stations_insert ON lab_stations
  FOR INSERT
  WITH CHECK (
    -- 1) Lab sahibinin kendi istasyonu
    (
      lab_profile_id = auth.uid()
      AND auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'lab')
    )
    OR
    -- 2) Aynı laba bağlı çalışan (profile.lab_id = lab_profile_id)
    lab_profile_id IN (
      SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lab_stations_update ON lab_stations;

CREATE POLICY lab_stations_update ON lab_stations
  FOR UPDATE
  USING (
    lab_profile_id = auth.uid()
    OR lab_profile_id IN (
      SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL
    )
  )
  WITH CHECK (
    lab_profile_id = auth.uid()
    OR lab_profile_id IN (
      SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lab_stations_delete ON lab_stations;

CREATE POLICY lab_stations_delete ON lab_stations
  FOR DELETE
  USING (
    lab_profile_id = auth.uid()
    OR lab_profile_id IN (
      SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL
    )
  );
