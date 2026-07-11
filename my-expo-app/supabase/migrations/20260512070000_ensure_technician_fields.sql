-- Ensure technician fields (monthly_salary, allowed_stages) exist + reload cache.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_salary  NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_stages  TEXT[]        DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
