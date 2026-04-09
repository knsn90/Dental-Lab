-- ──────────────────────────────────────────────────────────────────────────────
-- 008: Hasta uyruk / ikamet ülkesi / şehir alanları
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS patient_nationality TEXT,
  ADD COLUMN IF NOT EXISTS patient_country     TEXT,
  ADD COLUMN IF NOT EXISTS patient_city        TEXT;
