-- create_purchase_invoice RPC stock_items.is_active kullanıyor ama kolon yok.
-- Eksik kolonu ekle (default TRUE).
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.stock_items.is_active IS
  'Aktif/pasif durumu — pasif item satın alma sırasında auto-create edilenler için';
