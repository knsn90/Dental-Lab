-- Medit Link entegrasyonu için scan/CAD dosyaları external ref'i.
ALTER TABLE public.work_order_photos
  ADD COLUMN IF NOT EXISTS external_id     TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_photos_external
  ON public.work_order_photos(external_source, external_id)
  WHERE external_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
