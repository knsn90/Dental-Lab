-- ============================================================
-- lab_services: üretim süresi (gün cinsinden)
-- ============================================================
ALTER TABLE public.lab_services
  ADD COLUMN IF NOT EXISTS production_days INTEGER;

COMMENT ON COLUMN public.lab_services.production_days IS
  'Hizmetin tahmini üretim süresi (gün cinsinden). NULL ise belirsiz.';
