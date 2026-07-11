-- lab_stations.auto_progress eksikti — complete_stage_simple SELECT'i hata veriyordu.
ALTER TABLE public.lab_stations
  ADD COLUMN IF NOT EXISTS auto_progress BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.lab_stations.auto_progress IS
  'TRUE → bu istasyona iş geldiğinde otomatik tamamlandı işaretlenir (audit aktörü caller).';

NOTIFY pgrst, 'reload schema';
