-- Geri alma: 20261027164000_prova_metinleri — 161000/162000/163000 göçlerindeki tanımlar (canlıyla birebir)

create or replace function public.prova_client_returned(p_prova uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_pr public.provas; v_no text;
begin
  select * into v_pr from public.provas where id = p_prova for update;
  if v_pr.id is null or not public._prova_client_can(v_pr.work_order_id) then
    raise exception 'Bu provayı işaretleme yetkiniz yok' using errcode = '42501';
  end if;
  if v_pr.status <> 'gönderildi' then raise exception 'Prova klinikte görünmüyor' using errcode = 'P0001'; end if;
  update public.provas set status = 'onay_bekliyor', client_returned_at = now(), client_returned_by = auth.uid()
   where id = p_prova;
  select order_number into v_no from public.work_orders where id = v_pr.work_order_id;
  perform public._prova_notify_lab(v_pr.work_order_id, 'Prova geri gönderildi',
    '#' || coalesce(v_no, '?') || ' · lab onayı bekliyor');
end;
$function$;

create or replace function public._appt_label(p_kind text, p_date date, p_time time)
 returns text
 language sql
 immutable
as $function$
  select case p_kind when 'prova' then 'Prova' else 'Takma' end || ' ' || to_char(p_date, 'DD.MM.YYYY')
         || case when p_time is null then '' else ' ' || to_char(p_time, 'HH24:MI') end;
$function$;

create or replace function public.appt_save(p_order uuid, p_appt uuid, p_kind text, p_date date, p_time time default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wo public.work_orders; v_a public.order_appointments; v_mgr boolean; v_client boolean;
  v_direct boolean; v_today date; v_id uuid; v_action text;
begin
  select * into v_wo from public.work_orders where id = p_order;
  v_mgr    := v_wo.id is not null and public._prova_can_manage(p_order);
  v_client := v_wo.id is not null and not v_mgr and public._prova_client_can(p_order);
  if not v_mgr and not v_client then
    raise exception 'Bu siparişte randevu değiştirme yetkiniz yok' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('prova', 'takma') then raise exception 'Geçersiz randevu türü' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Randevu günü gerekli' using errcode = '22023'; end if;
  if v_wo.status::text in ('teslim_edildi', 'iptal') then
    raise exception 'Kapanmış siparişte randevu değiştirilemez' using errcode = 'P0001';
  end if;
  v_today  := public.lab_today(v_wo.lab_id);
  v_direct := v_mgr or not public._order_planning_started(p_order);

  if p_appt is not null then
    select * into v_a from public.order_appointments
     where id = p_appt and work_order_id = p_order and removed_at is null for update;
    if v_a.id is null then raise exception 'Randevu bulunamadı' using errcode = 'P0002'; end if;
  end if;
  if (v_a.id is null or p_date is distinct from coalesce(v_a.pending_date, v_a.appt_date)) and p_date < v_today then
    raise exception 'Geçmiş bir gün seçilemez' using errcode = '22023';
  end if;

  if v_direct or (v_a.id is not null and v_a.appt_date is null and v_a.pending_by = auth.uid()) then
    -- doğrudan (lab / planlama öncesi) ya da hekimin kendi onaysız önerisini düzenlemesi
    if v_a.id is null then
      insert into public.order_appointments(lab_id, work_order_id, kind, appt_date, appt_time, created_by)
      values (v_wo.lab_id, p_order, p_kind, p_date, p_time, auth.uid())
      returning id into v_id;
      v_action := 'Randevu ekledi';
    elsif v_a.appt_date is null then
      update public.order_appointments set kind = p_kind, pending_date = p_date, pending_time = p_time,
             pending_at = now(), updated_at = now()
       where id = v_a.id;
      v_id := v_a.id; v_action := 'Randevu önerdi';
    else
      update public.order_appointments set
        kind = p_kind, appt_date = p_date, appt_time = p_time,
        pending_action = null, pending_date = null, pending_time = null, pending_by = null, pending_at = null,
        review_note = null,
        risk_notified_level = case when appt_date is distinct from p_date then null else risk_notified_level end,
        updated_at = now()
       where id = v_a.id;
      v_id := v_a.id; v_action := 'Randevu değiştirdi';
    end if;
  else
    if v_a.id is null then
      insert into public.order_appointments(lab_id, work_order_id, kind, appt_date, pending_action, pending_date,
                                            pending_time, pending_by, pending_at, created_by)
      values (v_wo.lab_id, p_order, p_kind, null, 'ekle', p_date, p_time, auth.uid(), now(), auth.uid())
      returning id into v_id;
    else
      update public.order_appointments set
        pending_action = 'degistir', pending_date = p_date, pending_time = p_time,
        pending_by = auth.uid(), pending_at = now(), review_note = null, updated_at = now()
       where id = v_a.id;
      v_id := v_a.id;
    end if;
    v_action := 'Randevu önerdi';
    perform public._prova_notify_lab(p_order, 'Randevu önerisi',
      '#' || coalesce(v_wo.order_number, '?') || ' · ' || public._appt_label(p_kind, p_date, p_time) || ' · onay bekliyor');
  end if;

  perform public._appt_log(v_action, p_order, jsonb_build_object(
    'kind', p_kind, 'date', p_date, 'time', p_time, 'old_date', v_a.appt_date, 'appointment_id', v_id));
  return v_id;
end;
$function$;

create or replace function public.appt_remove(p_appt uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_a public.order_appointments; v_wo public.work_orders; v_mgr boolean; v_client boolean;
begin
  select * into v_a from public.order_appointments where id = p_appt and removed_at is null for update;
  if v_a.id is null then raise exception 'Randevu bulunamadı' using errcode = 'P0002'; end if;
  select * into v_wo from public.work_orders where id = v_a.work_order_id;
  v_mgr    := public._prova_can_manage(v_a.work_order_id);
  v_client := not v_mgr and public._prova_client_can(v_a.work_order_id);
  if not v_mgr and not v_client then
    raise exception 'Bu siparişte randevu değiştirme yetkiniz yok' using errcode = '42501';
  end if;
  if v_wo.status::text in ('teslim_edildi', 'iptal') then
    raise exception 'Kapanmış siparişte randevu değiştirilemez' using errcode = 'P0001';
  end if;

  if v_mgr or not public._order_planning_started(v_a.work_order_id)
     or (v_a.appt_date is null and v_a.pending_by = auth.uid()) then
    update public.order_appointments set removed_at = now(), pending_action = null, pending_date = null,
           pending_time = null, pending_by = null, pending_at = null, updated_at = now()
     where id = v_a.id;
    perform public._appt_log('Randevu sildi', v_a.work_order_id, jsonb_build_object(
      'kind', v_a.kind, 'date', coalesce(v_a.appt_date, v_a.pending_date), 'appointment_id', v_a.id));
  else
    update public.order_appointments set pending_action = 'sil', pending_date = null, pending_time = null,
           pending_by = auth.uid(), pending_at = now(), review_note = null, updated_at = now()
     where id = v_a.id;
    perform public._prova_notify_lab(v_a.work_order_id, 'Randevu önerisi',
      '#' || coalesce(v_wo.order_number, '?') || ' · ' || public._appt_label(v_a.kind, v_a.appt_date, v_a.appt_time)
      || ' · silinmesi önerildi');
    perform public._appt_log('Randevu önerdi', v_a.work_order_id, jsonb_build_object(
      'kind', v_a.kind, 'date', v_a.appt_date, 'action', 'sil', 'appointment_id', v_a.id));
  end if;
end;
$function$;

create or replace function public.appt_review(p_appt uuid, p_approve boolean, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_a public.order_appointments; v_no text; v_title text;
begin
  select * into v_a from public.order_appointments where id = p_appt and removed_at is null for update;
  if v_a.id is null or not public._prova_can_manage(v_a.work_order_id) then
    raise exception 'Bu randevu önerisini karara bağlama yetkiniz yok' using errcode = '42501';
  end if;
  if v_a.pending_action is null then raise exception 'Bekleyen öneri yok' using errcode = 'P0001'; end if;

  if p_approve then
    update public.order_appointments set
      appt_date  = case when v_a.pending_action = 'sil' then appt_date else v_a.pending_date end,
      appt_time  = case when v_a.pending_action = 'sil' then appt_time else v_a.pending_time end,
      removed_at = case when v_a.pending_action = 'sil' then now() else null end,
      risk_notified_level = null,
      pending_action = null, pending_date = null, pending_time = null, pending_at = null,
      review_note = null, reviewed_at = now(), updated_at = now()
     where id = v_a.id;
    v_title := 'Randevu önerisi onaylandı';
  else
    update public.order_appointments set
      removed_at = case when v_a.appt_date is null then now() else null end,
      pending_action = null, pending_date = null, pending_time = null, pending_at = null,
      review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_at = now(), updated_at = now()
     where id = v_a.id;
    v_title := 'Randevu önerisi reddedildi';
  end if;

  perform public._appt_log(case when p_approve then 'Randevu önerisini onayladı' else 'Randevu önerisini reddetti' end,
    v_a.work_order_id, jsonb_build_object('kind', v_a.kind, 'date', coalesce(v_a.pending_date, v_a.appt_date),
      'old_date', v_a.appt_date, 'action', v_a.pending_action, 'appointment_id', v_a.id));

  if v_a.pending_by is not null then
    select order_number into v_no from public.work_orders where id = v_a.work_order_id;
    perform public._notify_inapp(v_a.pending_by, 'order_status', v_title,
      '#' || coalesce(v_no, '?') || ' · ' || public._appt_label(v_a.kind, coalesce(v_a.pending_date, v_a.appt_date), v_a.pending_time)
      || case when not p_approve and nullif(btrim(coalesce(p_note, '')), '') is not null then ' · ' || btrim(p_note) else '' end,
      'work_order', v_a.work_order_id, '/order/' || v_a.work_order_id::text || '?tab=prova',
      jsonb_build_object('order_number', v_no));
  end if;
end;
$function$;

create or replace function public._prova_risk_check(p_order uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; v_a uuid; v_no text;
begin
  select * into r from public._order_appt_risk(p_order);
  if r.level is distinct from 'yetismiyor' then return; end if;
  select a.id into v_a from public.order_appointments a
   where a.work_order_id = p_order and a.kind = 'takma' and a.removed_at is null
     and a.appt_date = r.takma_date and a.risk_notified_level is distinct from 'yetismiyor'
   limit 1;
  if v_a is null then return; end if;
  select order_number into v_no from public.work_orders where id = p_order;
  perform public._prova_notify_lab(p_order, 'Randevuya yetişmiyor',
    '#' || coalesce(v_no, '?') || ' · teslim ' || to_char(r.effective_delivery, 'DD.MM.YYYY')
    || ', takma ' || to_char(r.takma_date, 'DD.MM.YYYY'));
  update public.order_appointments set risk_notified_level = 'yetismiyor' where id = v_a;
end;
$function$;

create or replace function public.fn_prova_watch()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record; v_no text; v_uid uuid; v_nid uuid; v_title text; v_body text; v_url text; v_sent integer := 0;
  v_secret text; v_hdr jsonb; v_takma date;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_base text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_fn_secret' limit 1;
  exception when others then v_secret := null; end;
  v_hdr := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon,
                              'apikey', v_anon, 'x-notify-secret', coalesce(v_secret, ''));

  for r in select * from public._prova_watch_collect(null) loop
    select order_number into v_no from public.work_orders where id = r.work_order_id;
    v_url := '/order/' || r.work_order_id::text || '?tab=prova';
    if r.kind = 'prova_late' then
      perform public._prova_notify_lab(r.work_order_id, 'Prova ' || r.late_days || ' gün gecikti',
        '#' || coalesce(v_no, '?') || ' · provanın dönmesi gecikti');
      v_title := 'Provanın dönmesi gecikti';
      v_body  := '#' || coalesce(v_no, '?') || ' · prova laboratuvara henüz dönmedi';
      for v_uid in select * from public._order_client_recipients(r.work_order_id) loop
        v_nid := public._notify_inapp(v_uid, 'order_status', v_title, v_body, 'work_order', r.work_order_id, v_url,
                                      jsonb_build_object('order_number', v_no));
        perform net.http_post(
          url := v_base || 'send-email-notification', headers := v_hdr,
          body := jsonb_build_object('userIds', jsonb_build_array(v_uid::text), 'category', 'order_status',
                    'notificationId', v_nid::text,
                    'payload', jsonb_build_object('title', v_title, 'body', v_body, 'actionUrl', v_url,
                                                  'resourceType', 'work_order', 'resourceId', r.work_order_id::text)));
      end loop;
      update public.provas set late_notified_at = now() where id = r.ref_id;
    else
      select appt_date into v_takma from public.order_appointments where id = r.ref_id;
      perform public._prova_notify_lab(r.work_order_id,
        case r.level when 'yetismiyor' then 'Randevuya yetişmiyor' else 'Randevu yaklaşıyor' end,
        '#' || coalesce(v_no, '?') || ' · takma randevusu ' || to_char(v_takma, 'DD.MM.YYYY'));
      update public.order_appointments set risk_notified_level = r.level where id = r.ref_id;
    end if;
    v_sent := v_sent + 1;
  end loop;

  -- risk kalktıysa (tarih değişti) seviye sıfırlanır; yeniden yükselirse yeniden bildirilir
  update public.order_appointments a set risk_notified_level = null
   where a.risk_notified_level is not null and a.removed_at is null
     and coalesce((select r2.level from public._order_appt_risk(a.work_order_id) r2), 'yetisir') = 'yetisir';

  return v_sent;
end;
$function$;
