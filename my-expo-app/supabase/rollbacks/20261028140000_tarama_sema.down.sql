-- Geri alma: 20261028140000_tarama_sema
drop table if exists public.scan_patient_charges;
drop table if exists public.scan_patients;
drop table if exists public.scan_appointment_services;
drop table if exists public.scan_appointments;
drop function if exists public._scan_can_view();
drop function if exists public._scan_can_manage();
drop function if exists public._scan_enabled(uuid);
alter table public.lab_services drop constraint if exists lab_services_scan_kind_chk;
alter table public.equipment drop constraint if exists equipment_scan_kind_chk;
alter table public.lab_services drop column if exists scan_kind, drop column if exists scan_free_if_order;
alter table public.equipment drop column if exists scan_kind;
alter table public.clinics drop column if exists geo_lat, drop column if exists geo_lng,
  drop column if exists geo_addr_hash, drop column if exists geo_at;
alter table public.lab_settings drop column if exists scan_hours_start, drop column if exists scan_hours_end,
  drop column if exists scan_workdays, drop column if exists scan_default_minutes,
  drop column if exists scan_buffer_minutes, drop column if exists scan_morning_at,
  drop column if exists scan_evening_at, drop column if exists scan_technician_ids;
delete from public.lab_feature_flags where key = 'scan_appointments';
delete from public.platform_feature_flags where key = 'scan_appointments';
