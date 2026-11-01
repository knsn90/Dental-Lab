-- ════════════════════════════════════════════════════════════════════════════
-- Tarama randevuları — sabah/akşam program bildirimi (plan Task 8)
-- spec: docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md (4.11)
--
-- _scan_digest_payload: içerik (GÖNDERMEZ — probe edilebilir). Hasta adı YOK (KVKK).
-- fn_scan_schedule_digest: saat başı cron; bayrağı açık her lab için yerel saat
--   scan_morning_at saatine eşitse "bugün", scan_evening_at saatine eşitse "yarın".
--   Alıcı: admin + lab yöneticisi (lab'ın tamamı) ve havuzdaki teknisyenler (yalnız kendi randevuları).
--   Kanallar: uygulama içi + e-posta + push (expo, web). WhatsApp YOK (Meta şablonu yok).
--   Aynı kişiye aynı tür+tarih ikinci kez gitmez. Program boşsa gitmez.
-- Kanal dağıtımı fn_daily_order_watch kalıbı (Vault notify_fn_secret + net_anon_key).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._scan_digest_payload(p_lab uuid, p_kind text, p_local_date date, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tz text := public._scan_tz(p_lab);
  v_mgr boolean;
  v_items jsonb; v_n int; v_pending int := 0; v_unmarked int := 0;
  v_from timestamptz; v_to timestamptz; v_lines text; v_title text; v_body text;
begin
  select (p.user_type = 'admin' or (p.user_type = 'lab' and p.role in ('manager', 'admin')))
    into v_mgr from public.profiles p where p.id = p_user and p.lab_id = p_lab;
  if v_mgr is null then return null; end if;
  v_from := p_local_date::timestamp at time zone v_tz;
  v_to   := (p_local_date + 1)::timestamp at time zone v_tz;

  select coalesce(jsonb_agg(jsonb_build_object(
           'time', to_char(a.starts_at at time zone v_tz, 'HH24:MI'),
           'clinic', coalesce(c.name, ''),
           'services', coalesce(svc.names, ''),
           'technician', coalesce(t.full_name, ''),
           'device', coalesce(svc.devices, ''),
           'patients', (select count(*) from public.scan_patients sp where sp.appointment_id = a.id))
           order by a.starts_at), '[]'::jsonb),
         count(*),
         string_agg(to_char(a.starts_at at time zone v_tz, 'HH24:MI') || ' · ' || coalesce(c.name, '')
                    || ' · ' || coalesce(svc.names, '') || ' · ' || coalesce(t.full_name, ''), E'\n' order by a.starts_at)
    into v_items, v_n, v_lines
    from public.scan_appointments a
    left join public.clinics c on c.id = a.clinic_id
    left join public.profiles t on t.id = a.technician_id
    left join lateral (
      select string_agg(s.name, ', ' order by s.name) as names,
             string_agg(e.name, ', ' order by e.name) as devices
        from public.scan_appointment_services x
        join public.lab_services s on s.id = x.service_id
        left join public.equipment e on e.id = x.equipment_id
       where x.appointment_id = a.id) svc on true
   where a.lab_id = p_lab and a.status = 'planlandi'
     and a.starts_at >= v_from and a.starts_at < v_to
     and (v_mgr or a.technician_id = p_user);

  if v_mgr and p_kind = 'morning' then
    select count(*) into v_pending
      from public.scan_patients sp join public.scan_appointments a on a.id = sp.appointment_id
     where a.lab_id = p_lab and a.status = 'yapildi' and sp.status = 'karar_bekliyor';
    select count(*) into v_unmarked
      from public.scan_appointments a
     where a.lab_id = p_lab and a.status = 'planlandi' and a.starts_at < v_from;
  end if;
  if v_n = 0 and v_pending = 0 and v_unmarked = 0 then return null; end if;

  v_title := case when p_kind = 'morning' then 'Bugünün tarama programı' else 'Yarının tarama programı' end
             || ' · ' || v_n;
  v_body := coalesce(v_lines, '');
  if v_pending > 0 then
    v_body := v_body || case when v_body = '' then '' else E'\n' end || 'Karar bekleyen tarama · ' || v_pending;
  end if;
  if v_unmarked > 0 then
    v_body := v_body || case when v_body = '' then '' else E'\n' end || 'İşaretlenmemiş randevu · ' || v_unmarked;
  end if;
  return jsonb_build_object('title', v_title, 'body', v_body, 'items', v_items, 'count', v_n,
                            'pending', v_pending, 'unmarked', v_unmarked, 'kind', p_kind, 'date', p_local_date);
end $$;

create or replace function public.fn_scan_schedule_digest()
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v_secret text; v_anon text; v_hdr jsonb;
  v_base text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
  v_lab record; v_now timestamp; v_kind text; v_date date;
  v_u record; v_pl jsonb; v_notif uuid; v_fn text; v_action text; v_sent int := 0;
begin
  begin select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_fn_secret' limit 1;
  exception when others then v_secret := null; end;
  begin select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'net_anon_key' limit 1;
  exception when others then v_anon := null; end;
  v_hdr := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_anon, ''),
                              'apikey', coalesce(v_anon, ''), 'x-notify-secret', coalesce(v_secret, ''));

  for v_lab in
    select l.id, public._scan_tz(l.id) as tz, s.scan_morning_at, s.scan_evening_at, s.scan_technician_ids
      from public.labs l join public.lab_settings s on s.lab_id = l.id
     where public._scan_enabled(l.id)
  loop
    v_now := now() at time zone v_lab.tz;
    v_kind := null;
    if extract(hour from v_now) = extract(hour from coalesce(v_lab.scan_morning_at, '08:00'::time)) then
      v_kind := 'morning'; v_date := v_now::date;
    elsif extract(hour from v_now) = extract(hour from coalesce(v_lab.scan_evening_at, '18:00'::time)) then
      v_kind := 'evening'; v_date := v_now::date + 1;
    end if;
    continue when v_kind is null;

    for v_u in
      select p.id, p.user_type, p.role from public.profiles p
       where p.lab_id = v_lab.id and coalesce(p.is_active, true)
         and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role in ('manager', 'admin'))
              or (p.user_type = 'lab' and p.role = 'technician'
                  and (cardinality(coalesce(v_lab.scan_technician_ids, '{}')) = 0 or p.id = any (v_lab.scan_technician_ids))))
    loop
      if exists (select 1 from public.notifications n
                  where n.user_id = v_u.id and n.category = 'scan_schedule'
                    and n.payload->>'kind' = v_kind and n.payload->>'date' = v_date::text) then
        continue;
      end if;
      v_pl := public._scan_digest_payload(v_lab.id, v_kind, v_date, v_u.id);
      continue when v_pl is null;
      v_action := case when v_u.user_type = 'admin' then '/(admin)/scans'
                       when v_u.role = 'technician' then '/(station)/scans' else '/(lab)/scans' end;
      insert into public.notifications (user_id, lab_id, category, title, body, resource_type, action_url, payload)
      values (v_u.id, v_lab.id, 'scan_schedule', v_pl->>'title', v_pl->>'body', 'scan_schedule', v_action,
              jsonb_build_object('kind', v_kind, 'date', v_date::text, 'items', v_pl->'items',
                                 'pending', v_pl->'pending', 'unmarked', v_pl->'unmarked'))
      returning id into v_notif;
      foreach v_fn in array array['send-email-notification', 'send-expo-push', 'send-web-push'] loop
        perform net.http_post(
          url := v_base || v_fn, headers := v_hdr,
          body := jsonb_build_object(
            'userIds', jsonb_build_array(v_u.id::text), 'category', 'scan_schedule',
            'notificationId', v_notif::text,
            'payload', jsonb_build_object('title', v_pl->>'title', 'body', v_pl->>'body', 'actionUrl', v_action,
                                          'resourceType', 'scan_schedule', 'items', v_pl->'items')));
      end loop;
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end $$;

revoke all on function public._scan_digest_payload(uuid, text, date, uuid), public.fn_scan_schedule_digest()
  from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'scan-schedule-digest';
select cron.schedule('scan-schedule-digest', '0 * * * *', 'select public.fn_scan_schedule_digest()');
