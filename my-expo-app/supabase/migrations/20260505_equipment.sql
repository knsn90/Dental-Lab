-- ============================================================
-- Migration: Equipment / Demirbaş Yönetimi
--
-- Lab cihazlarını (CAD/CAM, fırın, tarayıcı vb.) takip eder.
-- Her cihaz bir teknisyene atanabilir.
-- ============================================================

CREATE TABLE IF NOT EXISTS equipment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID REFERENCES profiles(id),          -- hangi lab'a ait
  name          TEXT NOT NULL,                          -- Cihaz adı (ör: "Zirkonzahn M5")
  brand         TEXT,                                   -- Marka (ör: "Zirkonzahn")
  model         TEXT,                                   -- Model (ör: "M5 Heavy")
  serial_number TEXT,                                   -- Seri numarası
  category      TEXT NOT NULL DEFAULT 'other'           -- Kategori
    CHECK (category IN (
      'cad_cam', 'scanner', 'furnace', 'milling', 'printer',
      'sintering', 'polishing', 'articulator', 'compressor', 'other'
    )),
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'maintenance', 'retired')),
  assigned_to   UUID REFERENCES profiles(id),           -- Atanan teknisyen
  purchase_date DATE,                                   -- Alım tarihi
  warranty_end  DATE,                                   -- Garanti bitiş
  notes         TEXT,                                   -- Notlar
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_equipment_lab     ON equipment(lab_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned ON equipment(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_status   ON equipment(status);

-- RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Lab/admin can see and manage their equipment
DROP POLICY IF EXISTS "equipment_lab_access" ON equipment;
CREATE POLICY "equipment_lab_access" ON equipment
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('lab', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('lab', 'admin')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_equipment_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_updated ON equipment;
CREATE TRIGGER trg_equipment_updated
  BEFORE UPDATE ON equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_timestamp();
