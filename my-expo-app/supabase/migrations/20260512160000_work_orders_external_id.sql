-- Medit Link (ve diğer dış sistem) entegrasyonu için external referans.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS external_id     TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_external
  ON public.work_orders(external_source, external_id)
  WHERE external_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
