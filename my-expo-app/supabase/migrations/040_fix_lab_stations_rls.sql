-- ─────────────────────────────────────────────────────────────────────────────
-- 040_fix_lab_stations_rls.sql
-- lab_stations tablosu için eksik INSERT / UPDATE / DELETE politikaları eklendi.
-- Migration 039'da sadece SELECT politikası tanımlanmıştı; bu yüzden
-- uygulama katmanından istasyon eklemek / güncellemek / silmek başarısız oluyordu.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Eski SELECT politikasını düzelt (tutarlılık için yeniden yaz) ──────────

DROP POLICY IF EXISTS lab_stations_select ON lab_stations;

CREATE POLICY lab_stations_select ON lab_stations
  FOR SELECT
  USING (
    -- Kendi labına ait istasyonlar
    lab_profile_id = auth.uid()
    OR
    -- Aynı laba bağlı teknisyenler
    lab_profile_id IN (
      SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL
    )
    OR
    -- Admin her şeyi görebilir
    auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'admin')
  );

-- ── 2. INSERT — Sadece lab mesul müdürü kendi istasyonunu ekleyebilir ─────────

DROP POLICY IF EXISTS lab_stations_insert ON lab_stations;

CREATE POLICY lab_stations_insert ON lab_stations
  FOR INSERT
  WITH CHECK (
    -- Eklenen satırın lab_profile_id'si oturum açan kullanıcının kendi id'si
    lab_profile_id = auth.uid()
    AND
    -- Ve o kullanıcı gerçekten bir lab hesabı
    auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'lab')
  );

-- ── 3. UPDATE — Lab mesul müdürü kendi istasyonlarını güncelleyebilir ─────────

DROP POLICY IF EXISTS lab_stations_update ON lab_stations;

CREATE POLICY lab_stations_update ON lab_stations
  FOR UPDATE
  USING (
    lab_profile_id = auth.uid()
    AND auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'lab')
  )
  WITH CHECK (
    lab_profile_id = auth.uid()
  );

-- ── 4. DELETE — Lab mesul müdürü kendi istasyonlarını silebilir ───────────────

DROP POLICY IF EXISTS lab_stations_delete ON lab_stations;

CREATE POLICY lab_stations_delete ON lab_stations
  FOR DELETE
  USING (
    lab_profile_id = auth.uid()
    AND auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'lab')
  );
