-- 20260725140000_stock_thickness_mm.sql
-- Stok kalemine disk kalınlığı (mm) — zirkonyum disklerde diş başına tüketim
-- (units_per_tooth) önerisini kalınlıktan türetmek için. Additive, nullable;
-- mevcut kalemleri etkilemez.

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS thickness_mm NUMERIC(6, 2);

COMMENT ON COLUMN public.stock_items.thickness_mm IS
  'Disk/blok kalınlığı (mm). Zirkonyum disklerde units_per_tooth önerisini besler (bkz. core/materials/consumptionRef.ts).';
