-- Geri alma: 20261028144000_tarama_bildirim
select cron.unschedule(jobid) from cron.job where jobname = 'scan-schedule-digest';
drop function if exists public.fn_scan_schedule_digest();
drop function if exists public._scan_digest_payload(uuid, text, date, uuid);
