-- Geri alma: 20261028145000_tarama_niyet
drop function if exists public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb, text, uuid);
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


revoke all on function public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb) from public, anon;
grant execute on function public.scan_appt_save(uuid, uuid, uuid, timestamptz, int, uuid, text, text, jsonb) to authenticated;
alter table public.scan_appointments drop constraint if exists scan_appointments_intent_chk;
alter table public.scan_appointments drop column if exists intended_order_id, drop column if exists intent;
