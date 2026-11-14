ALTER TABLE public.deliveries
  DROP COLUMN IF EXISTS external_carrier_name,
  DROP COLUMN IF EXISTS external_tracking_url;
