-- ============================================================
-- Migration: Add location + barcode columns to stock_items
-- Purpose: Enable shelf/rack tracking and barcode/QR for items
-- ============================================================

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS barcode  TEXT;

-- Index for quick location-based lookups
CREATE INDEX IF NOT EXISTS idx_stock_items_location ON stock_items(location);

-- Unique constraint on barcode (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_barcode ON stock_items(barcode) WHERE barcode IS NOT NULL;

COMMENT ON COLUMN stock_items.location IS 'Shelf/rack code, e.g. A-1, Raf B-3';
COMMENT ON COLUMN stock_items.barcode  IS 'Barcode or QR code value for the item';
