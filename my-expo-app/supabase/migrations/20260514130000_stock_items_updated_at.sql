-- create_purchase_invoice RPC stock_items.updated_at güncelliyor, kolon yok.
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

-- Otomatik güncelleme trigger'ı (her UPDATE'de updated_at = NOW())
CREATE OR REPLACE FUNCTION public.fn_stock_items_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_items_touch_updated_at ON public.stock_items;
CREATE TRIGGER trg_stock_items_touch_updated_at
  BEFORE UPDATE ON public.stock_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_stock_items_touch_updated_at();
