-- Depo + Konum yönetimi.
--   warehouses        — labın depoları (ör: "Ana Depo", "Şube 1")
--   stock_locations   — depo içindeki konumlar (raf, bölüm, dolap)
--   stock_items       → warehouse_id, location_id (opsiyonel FK)

CREATE TABLE IF NOT EXISTS public.warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (lab_id, name)
);
CREATE INDEX IF NOT EXISTS idx_warehouses_lab ON public.warehouses(lab_id);

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  warehouse_id  uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  name          text NOT NULL,         -- "Raf A1", "Dolap 2 - Üst", vb.
  notes         text,
  is_active     boolean NOT NULL DEFAULT TRUE,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (lab_id, warehouse_id, name)
);
CREATE INDEX IF NOT EXISTS idx_stock_locations_lab        ON public.stock_locations(lab_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_warehouse  ON public.stock_locations(warehouse_id);

-- stock_items → konum referansları (opsiyonel, mevcut text alanı korunur)
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id  uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_items_warehouse ON public.stock_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_location  ON public.stock_items(location_id);

-- RLS — lab kullanıcıları kendi labının depoları/konumlarını yönetir
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_lab" ON public.warehouses;
CREATE POLICY "warehouses_lab" ON public.warehouses
  FOR ALL TO authenticated
  USING (
    lab_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    OR lab_id IN (SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL)
  )
  WITH CHECK (
    lab_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    OR lab_id IN (SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL)
  );

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_locations_lab" ON public.stock_locations;
CREATE POLICY "stock_locations_lab" ON public.stock_locations
  FOR ALL TO authenticated
  USING (
    lab_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    OR lab_id IN (SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL)
  )
  WITH CHECK (
    lab_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    OR lab_id IN (SELECT lab_id FROM profiles WHERE id = auth.uid() AND lab_id IS NOT NULL)
  );

-- updated_at trigger'ları
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warehouses_touch ON public.warehouses;
CREATE TRIGGER trg_warehouses_touch
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_stock_locations_touch ON public.stock_locations;
CREATE TRIGGER trg_stock_locations_touch
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
