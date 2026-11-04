-- Geri alma: 20261104150000_dusuk_puan_hatirlatma
BEGIN;
SELECT cron.unschedule('review-low-reminder-tick')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-low-reminder-tick');
DROP FUNCTION IF EXISTS public.fn_review_low_reminder_tick();
DROP FUNCTION IF EXISTS public._review_low_reminder_window(timestamptz);
COMMIT;
