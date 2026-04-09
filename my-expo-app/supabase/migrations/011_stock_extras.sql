-- stock_movements: tüm yeni kolonlar
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS technician_name TEXT,
  ADD COLUMN IF NOT EXISTS lot_no          TEXT,
  ADD COLUMN IF NOT EXISTS reference_no    TEXT,
  ADD COLUMN IF NOT EXISTS unit_price      NUMERIC(12,2);

-- stock_items: barkod ve raf adresi
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS barcode       TEXT,
  ADD COLUMN IF NOT EXISTS shelf_address TEXT;
