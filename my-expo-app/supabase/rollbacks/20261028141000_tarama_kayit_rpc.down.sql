-- Geri alma: 20261028141000_tarama_kayit_rpc
drop function if exists public.scan_set_clinic_geo(uuid, numeric, numeric, text);
drop function if exists public.scan_appt_cancel(uuid, text);
drop function if exists public.scan_appt_undo_done(uuid);
drop function if exists public.scan_appt_mark_done(uuid, text);
drop function if exists public.scan_patient_delete(uuid);
drop function if exists public.scan_patient_save(uuid, uuid, text, uuid[], text, uuid);
drop function if exists public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb);
drop function if exists public._scan_lock_appt(uuid, boolean);
drop function if exists public._scan_appt_refresh_status(uuid);
drop function if exists public._scan_notify_tech(uuid, uuid, text, uuid);
drop function if exists public._scan_appt_label(uuid);
drop function if exists public._scan_tz(uuid);
drop table if exists public.scan_clinic_geo;
alter table public.clinics
  add column if not exists geo_lat numeric, add column if not exists geo_lng numeric,
  add column if not exists geo_addr_hash text, add column if not exists geo_at timestamptz;
