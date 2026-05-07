-- ============================================================
-- 20260507 — Equipment → İstasyon ilişkisi
-- Demirbaşların hangi istasyonda kullanıldığını takip etmek için.
-- ============================================================

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS station_id UUID REFERENCES lab_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_station ON equipment(station_id) WHERE station_id IS NOT NULL;

COMMENT ON COLUMN equipment.station_id IS 'Demirbaşın bağlı olduğu lab istasyonu (örn. Tasarım, Frezeleme, Sinterleme)';
