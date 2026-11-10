BEGIN;
DROP TRIGGER IF EXISTS trg_lab_settings_finance_guard ON public.lab_settings;
DROP FUNCTION IF EXISTS public._lab_settings_finance_guard();
COMMIT;
