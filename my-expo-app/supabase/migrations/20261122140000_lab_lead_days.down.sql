DROP FUNCTION IF EXISTS public.lab_order_defaults(uuid);
ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_default_lead_days_chk,
  DROP CONSTRAINT IF EXISTS lab_settings_urgent_lead_days_chk,
  DROP COLUMN IF EXISTS default_lead_days,
  DROP COLUMN IF EXISTS urgent_lead_days;
