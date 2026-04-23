-- 013_photo_tooth_number.sql
-- Associate each uploaded photo with a specific tooth (FDI number)

ALTER TABLE work_order_photos
  ADD COLUMN IF NOT EXISTS tooth_number INTEGER;

-- Optional index for fast per-tooth queries
CREATE INDEX IF NOT EXISTS idx_work_order_photos_tooth
  ON work_order_photos (work_order_id, tooth_number);
