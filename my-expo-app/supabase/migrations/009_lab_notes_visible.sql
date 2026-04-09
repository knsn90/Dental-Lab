-- ──────────────────────────────────────────────────────────────────────────────
-- 009: Lab notu hekime görünürlük bayrağı
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS lab_notes_visible BOOLEAN NOT NULL DEFAULT FALSE;
