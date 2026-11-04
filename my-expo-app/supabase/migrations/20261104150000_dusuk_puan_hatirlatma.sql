-- 20261104150000_dusuk_puan_hatirlatma
-- Düşük puan 48 saattir aranmadıysa lab yöneticilerine bir kez hatırlatma (spec 2026-11-04 §5.3).
--   • Dönem başına bir hatırlatma; arandıysa ya da puan 3'ün üstüne çıktıysa gitmez.
--   • Yalnız Türkiye saatiyle 09:00–19:59 (gece WhatsApp gitmesin). Cron saat başı 37. dakikada.
-- Geri alma: rollbacks/20261104150000_dusuk_puan_hatirlatma.down.sql

CREATE OR REPLACE FUNCTION public._review_low_reminder_window(p_at timestamptz)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT extract(hour FROM p_at AT TIME ZONE 'Europe/Istanbul') BETWEEN 9 AND 19;
$function$;
REVOKE ALL ON FUNCTION public._review_low_reminder_window(timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_review_low_reminder_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  IF NOT public._review_low_reminder_window(now()) THEN RETURN 0; END IF;
  FOR r IN
    SELECT f.work_order_id
      FROM public.review_followups f
     WHERE f.cur_min <= 3
       AND (f.called_at IS NULL OR f.called_at < f.period_started_at)            -- açık ("Aranmadı")
       AND f.period_started_at <= now() - interval '48 hours'
       AND (f.reminder_sent_at IS NULL OR f.reminder_sent_at < f.period_started_at)  -- bu dönemde gitmemiş
     ORDER BY f.period_started_at
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Bir satırdaki hata diğerlerini durdurmaz.
    BEGIN
      PERFORM public._review_low_alert(r.work_order_id, 'review_low_reminder');
      UPDATE public.review_followups SET reminder_sent_at = now(), updated_at = now()
       WHERE work_order_id = r.work_order_id;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_review_low_reminder_tick %: %', r.work_order_id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END; $function$;
REVOKE ALL ON FUNCTION public.fn_review_low_reminder_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('review-low-reminder-tick')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-low-reminder-tick');
SELECT cron.schedule('review-low-reminder-tick', '37 * * * *', 'SELECT public.fn_review_low_reminder_tick()');
