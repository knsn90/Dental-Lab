-- ════════════════════════════════════════════════════════════════════════════
-- Tarama randevuları — kayıt RPC'leri (plan Task 2)
-- spec: docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md (4.1, 4.2, 4.10, 4.11)
--
-- Bütün yazmalar burada (DEFINER); tablolarda istemci yazma yetkisi yok (Task 1).
-- Hata metinleri Türkçe kaynak; istemci autoT ile çevirir.
-- Teknisyene giden anlık bildirim YALNIZ uygulama içi: category 'scan_schedule'
-- (trg_whatsapp_meta_notify bu kategoriyi göndermez), pg_net çağrısı yok.
--
-- Klinik koordinatı clinics'e değil scan_clinic_geo'ya yazılır: clinics'teki
-- trg_log_clinic_updated her UPDATE'te "Klinik güncellendi" kaydı atar; koordinat
-- yazımı sahte kayıt üretmesin. Task 1'in eklediği boş clinics.geo_* sütunları düşer.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.clinics
  drop column if exists geo_lat, drop column if exists geo_lng,
  drop column if exists geo_addr_hash, drop column if exists geo_at;

create table if not exists public.scan_clinic_geo (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  lab_id    uuid not null references public.labs(id) on delete cascade,
  lat       numeric not null,
  lng       numeric not null,
  addr_hash text,
  geo_at    timestamptz not null default now()
);
alter table public.scan_clinic_geo enable row level security;
drop policy if exists scan_clinic_geo_select on public.scan_clinic_geo;
create policy scan_clinic_geo_select on public.scan_clinic_geo for select to authenticated
  using (lab_id = public.get_my_lab_id() and public._scan_enabled(lab_id));
revoke all on public.scan_clinic_geo from anon;
revoke insert, update, delete, truncate, references, trigger on public.scan_clinic_geo from authenticated;
grant select on public.scan_clinic_geo to authenticated;

-- ── Yardımcılar ──
create or replace function public._scan_tz(p_lab uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(timezone, '') from public.labs where id = p_lab), 'Europe/Istanbul');
$$;

-- "Klinik · GG.AA SS:DD" (lab yerel saati) — etkinlik etiketi ve bildirim
create or replace function public._scan_appt_label(p_appt uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(c.name, '') || ' · ' || to_char(a.starts_at at time zone public._scan_tz(a.lab_id), 'DD.MM HH24:MI')
    from public.scan_appointments a left join public.clinics c on c.id = a.clinic_id
   where a.id = p_appt;
$$;

-- Teknisyene uygulama içi bildirim (değişikliği yapan kendisiyse atlanır)
create or replace function public._scan_notify_tech(p_tech uuid, p_lab uuid, p_head text, p_appt uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_clinic text; v_when text;
begin
  if p_tech is null or p_tech = auth.uid() then return; end if;
  select coalesce(c.name, ''), to_char(a.starts_at at time zone public._scan_tz(a.lab_id), 'DD.MM HH24:MI')
    into v_clinic, v_when
    from public.scan_appointments a left join public.clinics c on c.id = a.clinic_id where a.id = p_appt;
  insert into public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  values (p_tech, p_lab, 'scan_schedule', p_head || ' · ' || v_clinic, v_when,
          'scan_appointment', p_appt, '/(station)/scans',
          jsonb_build_object('kind', 'change', 'appointment_id', p_appt));
end $$;

-- Randevu durumu hasta satırlarından: yapildi ↔ kapandi
create or replace function public._scan_appt_refresh_status(p_appt uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_st text;
begin
  select status into v_st from public.scan_appointments where id = p_appt;
  if v_st not in ('yapildi', 'kapandi') then return; end if;
  if exists (select 1 from public.scan_patients where appointment_id = p_appt and status = 'karar_bekliyor')
     or not exists (select 1 from public.scan_patients where appointment_id = p_appt) then
    update public.scan_appointments set status = 'yapildi', updated_at = now() where id = p_appt and status <> 'yapildi';
  else
    update public.scan_appointments set status = 'kapandi', updated_at = now() where id = p_appt and status <> 'kapandi';
  end if;
end $$;

-- Randevuyu kilitler ve ortak kapıları uygular; p_tech_ok: atanmış teknisyen de yapabilir
create or replace function public._scan_lock_appt(p_appt uuid, p_tech_ok boolean)
returns public.scan_appointments language plpgsql security definer set search_path to 'public' as $$
declare v_lab uuid := public.get_my_lab_id(); v_a public.scan_appointments;
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  select * into v_a from public.scan_appointments where id = p_appt and lab_id = v_lab for update;
  if not found then raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001'; end if;
  if not (public._scan_can_manage() or (p_tech_ok and v_a.technician_id = auth.uid())) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = 'P0001';
  end if;
  return v_a;
end $$;

-- ── scan_appt_save ──
create or replace function public.scan_appt_save(
  p_id uuid, p_clinic uuid, p_doctor uuid, p_starts_at timestamptz, p_minutes int,
  p_technician uuid, p_source text, p_note text, p_services jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_lab uuid := public.get_my_lab_id();
  v_old public.scan_appointments;
  v_a   public.scan_appointments;
  r record;
  v_kind text; v_ekind text;
  v_ids uuid[] := '{}';
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not public._scan_can_manage() then raise exception 'Bu işlem için yetkiniz yok' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clinics where id = p_clinic and lab_id = v_lab) then
    raise exception 'Klinik bu lab''a ait değil' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_technician and lab_id = v_lab and user_type = 'lab') then
    raise exception 'Teknisyen bu lab''a ait değil' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 600 then
    raise exception 'Süre 15 ile 600 dakika arasında olmalı' using errcode = 'P0001';
  end if;
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) = 0 then
    raise exception 'Tarama hizmeti seçin' using errcode = 'P0001';
  end if;
  for r in select (e->>'service_id')::uuid as sid, nullif(e->>'equipment_id', '')::uuid as eid
             from jsonb_array_elements(p_services) e loop
    select scan_kind into v_kind from public.lab_services where id = r.sid and lab_id = v_lab;
    if v_kind is null then raise exception 'Tarama hizmeti seçin' using errcode = 'P0001'; end if;
    if r.eid is not null then
      select scan_kind into v_ekind from public.equipment where id = r.eid and lab_id = v_lab;
      if v_ekind is distinct from v_kind then
        raise exception 'Cihaz bu hizmetin türüne uymuyor' using errcode = 'P0001';
      end if;
    end if;
    v_ids := v_ids || r.sid;
  end loop;

  if p_id is null then
    insert into public.scan_appointments (lab_id, clinic_id, doctor_id, starts_at, duration_min, technician_id,
                                          source, note, created_by)
    values (v_lab, p_clinic, p_doctor, p_starts_at, p_minutes, p_technician,
            coalesce(nullif(p_source, ''), 'telefon'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning * into v_a;
  else
    v_old := public._scan_lock_appt(p_id, false);
    if v_old.status <> 'planlandi' then
      raise exception 'Yalnız planlanmış randevu değiştirilebilir' using errcode = 'P0001';
    end if;
    update public.scan_appointments
       set clinic_id = p_clinic, doctor_id = p_doctor, starts_at = p_starts_at, duration_min = p_minutes,
           technician_id = p_technician, source = coalesce(nullif(p_source, ''), 'telefon'),
           note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
     where id = p_id returning * into v_a;
  end if;

  -- hizmetleri eşitle (çıkarılan hizmetin hasta ücret satırları da gider)
  delete from public.scan_patient_charges c using public.scan_patients p
   where c.scan_patient_id = p.id and p.appointment_id = v_a.id and not (c.service_id = any (v_ids));
  delete from public.scan_appointment_services where appointment_id = v_a.id and not (service_id = any (v_ids));
  insert into public.scan_appointment_services (lab_id, appointment_id, service_id, equipment_id)
  select v_lab, v_a.id, (e->>'service_id')::uuid, nullif(e->>'equipment_id', '')::uuid
    from jsonb_array_elements(p_services) e
  on conflict (appointment_id, service_id) do update set equipment_id = excluded.equipment_id;

  if p_id is null then
    perform public.log_activity('Tarama randevusu oluşturdu', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('clinic_id', v_a.clinic_id, 'technician_id', v_a.technician_id,
                                                   'starts_at', v_a.starts_at, 'source', v_a.source));
    perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Yeni tarama randevusu', v_a.id);
  else
    perform public.log_activity('Tarama randevusunu değiştirdi', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('starts_at', jsonb_build_object('old', v_old.starts_at, 'new', v_a.starts_at),
                                                   'technician_id', jsonb_build_object('old', v_old.technician_id, 'new', v_a.technician_id)));
    if v_old.technician_id is distinct from v_a.technician_id then
      perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Yeni tarama randevusu', v_a.id);
      perform public._scan_notify_tech(v_old.technician_id, v_lab, 'Tarama randevusu değişti', v_a.id);
    elsif v_old.starts_at is distinct from v_a.starts_at then
      perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Tarama randevusu değişti', v_a.id);
    end if;
  end if;
  return v_a.id;
end $$;

-- ── scan_patient_save ──
create or replace function public.scan_patient_save(
  p_id uuid, p_appointment uuid, p_patient_name text, p_service_ids uuid[], p_note text, p_work_order uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_a public.scan_appointments;
  v_p public.scan_patients;
  v_id uuid;
begin
  v_a := public._scan_lock_appt(p_appointment, true);
  if v_a.status not in ('planlandi', 'yapildi') then
    raise exception 'Randevu kapanmış ya da iptal edilmiş' using errcode = 'P0001';
  end if;
  if p_service_ids is null or cardinality(p_service_ids) = 0
     or exists (select 1 from unnest(p_service_ids) s
                 where not exists (select 1 from public.scan_appointment_services x
                                    where x.appointment_id = v_a.id and x.service_id = s)) then
    raise exception 'Hastanın hizmeti randevunun hizmetlerinden seçilmeli' using errcode = 'P0001';
  end if;
  if p_work_order is not null and not exists (
       select 1 from public.work_orders w
        where w.id = p_work_order and w.lab_id = v_a.lab_id
          and public._resolve_wo_clinic_id(w.id) = v_a.clinic_id) then
    raise exception 'Sipariş bu kliniğe ait değil' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.scan_patients (lab_id, appointment_id, patient_name, note, work_order_id)
    values (v_a.lab_id, v_a.id, nullif(btrim(coalesce(p_patient_name, '')), ''),
            nullif(btrim(coalesce(p_note, '')), ''), p_work_order)
    returning id into v_id;
    perform public.log_activity('Taramaya hasta ekledi', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('scan_patient_id', v_id));
  else
    select * into v_p from public.scan_patients where id = p_id and appointment_id = v_a.id for update;
    if not found then raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001'; end if;
    if v_p.status <> 'karar_bekliyor' or v_p.decision is not null then
      raise exception 'Bu tarama zaten karara bağlanmış' using errcode = 'P0001';
    end if;
    update public.scan_patients
       set patient_name = nullif(btrim(coalesce(p_patient_name, '')), ''),
           note = nullif(btrim(coalesce(p_note, '')), ''), work_order_id = p_work_order
     where id = p_id;
    v_id := p_id;
    perform public.log_activity('Tarama hastasını düzeltti', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('scan_patient_id', v_id));
  end if;

  delete from public.scan_patient_charges
   where scan_patient_id = v_id and status = 'beklemede' and not (service_id = any (p_service_ids));
  insert into public.scan_patient_charges (lab_id, scan_patient_id, service_id)
  select v_a.lab_id, v_id, s from unnest(p_service_ids) s
  on conflict (scan_patient_id, service_id) do nothing;
  return v_id;
end $$;

-- ── scan_patient_delete ──
create or replace function public.scan_patient_delete(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_appt uuid; v_a public.scan_appointments; v_p public.scan_patients;
begin
  select appointment_id into v_appt from public.scan_patients where id = p_id;
  if v_appt is null then raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001'; end if;
  v_a := public._scan_lock_appt(v_appt, true);
  select * into v_p from public.scan_patients where id = p_id for update;
  if v_p.status <> 'karar_bekliyor' or v_p.decision is not null then
    raise exception 'Bu tarama zaten karara bağlanmış' using errcode = 'P0001';
  end if;
  if v_a.status = 'yapildi' and (select count(*) from public.scan_patients where appointment_id = v_a.id) <= 1 then
    raise exception 'En az bir hasta kalmalı' using errcode = 'P0001';
  end if;
  delete from public.scan_patients where id = p_id;
  perform public._scan_appt_refresh_status(v_a.id);
  perform public.log_activity('Tarama hastasını sildi', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                              jsonb_build_object('scan_patient_id', p_id));
end $$;

-- ── scan_appt_mark_done ──
create or replace function public.scan_appt_mark_done(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_a public.scan_appointments;
begin
  v_a := public._scan_lock_appt(p_id, true);
  if v_a.status <> 'planlandi' then
    raise exception 'Yalnız planlanmış randevu değiştirilebilir' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.scan_patients where appointment_id = p_id) then
    raise exception 'Tarama yapıldı demek için en az bir hasta ekleyin' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.scan_patients
              where appointment_id = p_id and length(btrim(coalesce(patient_name, ''))) < 2) then
    raise exception 'Her hastanın adını yazın' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.scan_patients p
              where p.appointment_id = p_id
                and not exists (select 1 from public.scan_patient_charges c where c.scan_patient_id = p.id)) then
    raise exception 'Hastanın hizmeti randevunun hizmetlerinden seçilmeli' using errcode = 'P0001';
  end if;
  update public.scan_appointments
     set status = 'yapildi', done_at = now(), done_by = auth.uid(),
         done_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_id;
  perform public.log_activity('Tarama yapıldı olarak işaretledi', 'scan_appointment', p_id, public._scan_appt_label(p_id),
                              jsonb_build_object('patients', (select count(*) from public.scan_patients where appointment_id = p_id)));
end $$;

-- ── scan_appt_undo_done ──
create or replace function public.scan_appt_undo_done(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_a public.scan_appointments;
begin
  v_a := public._scan_lock_appt(p_id, true);
  if exists (select 1 from public.scan_patients where appointment_id = p_id and decision is not null) then
    raise exception 'Karar verilmiş tarama varken geri alınamaz' using errcode = 'P0001';
  end if;
  if v_a.status <> 'yapildi' then
    raise exception 'Randevu kapanmış ya da iptal edilmiş' using errcode = 'P0001';
  end if;
  update public.scan_appointments
     set status = 'planlandi', done_at = null, done_by = null, done_note = null, updated_at = now()
   where id = p_id;
  perform public.log_activity('Tarama işaretini geri aldı', 'scan_appointment', p_id, public._scan_appt_label(p_id), null);
end $$;

-- ── scan_appt_cancel ──
create or replace function public.scan_appt_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_a public.scan_appointments;
begin
  v_a := public._scan_lock_appt(p_id, false);
  if v_a.status <> 'planlandi' then
    raise exception 'Yalnız planlanmış randevu değiştirilebilir' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'İptal nedenini yazın' using errcode = 'P0001';
  end if;
  update public.scan_appointments
     set status = 'iptal', cancel_reason = btrim(p_reason), updated_at = now()
   where id = p_id;
  perform public.log_activity('Tarama randevusunu iptal etti', 'scan_appointment', p_id, public._scan_appt_label(p_id),
                              jsonb_build_object('reason', btrim(p_reason)));
  perform public._scan_notify_tech(v_a.technician_id, v_a.lab_id, 'Tarama randevusu iptal edildi', p_id);
end $$;

-- ── scan_set_clinic_geo ──
create or replace function public.scan_set_clinic_geo(p_clinic uuid, p_lat numeric, p_lng numeric, p_addr_hash text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_lab uuid := public.get_my_lab_id();
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clinics where id = p_clinic and lab_id = v_lab) then
    raise exception 'Klinik bu lab''a ait değil' using errcode = 'P0001';
  end if;
  if not (public._scan_can_view()
          or exists (select 1 from public.scan_appointments
                      where clinic_id = p_clinic and technician_id = auth.uid())) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return; end if;
  insert into public.scan_clinic_geo (clinic_id, lab_id, lat, lng, addr_hash, geo_at)
  values (p_clinic, v_lab, p_lat, p_lng, p_addr_hash, now())
  on conflict (clinic_id) do update
    set lat = excluded.lat, lng = excluded.lng, addr_hash = excluded.addr_hash, geo_at = now();
end $$;

-- ── Yetkiler ──
revoke all on function
  public._scan_tz(uuid), public._scan_appt_label(uuid), public._scan_notify_tech(uuid, uuid, text, uuid),
  public._scan_appt_refresh_status(uuid), public._scan_lock_appt(uuid, boolean)
  from public, anon, authenticated;
revoke all on function
  public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb),
  public.scan_patient_save(uuid, uuid, text, uuid[], text, uuid),
  public.scan_patient_delete(uuid), public.scan_appt_mark_done(uuid, text),
  public.scan_appt_undo_done(uuid), public.scan_appt_cancel(uuid, text),
  public.scan_set_clinic_geo(uuid, numeric, numeric, text)
  from public, anon;
grant execute on function
  public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb),
  public.scan_patient_save(uuid, uuid, text, uuid[], text, uuid),
  public.scan_patient_delete(uuid), public.scan_appt_mark_done(uuid, text),
  public.scan_appt_undo_done(uuid), public.scan_appt_cancel(uuid, text),
  public.scan_set_clinic_geo(uuid, numeric, numeric, text)
  to authenticated;
