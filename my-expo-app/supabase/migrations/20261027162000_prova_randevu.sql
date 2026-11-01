-- 2. dalga 4 — Randevular, okuma RPC'leri ve randevu riski (spec 2026-10-27-prova-takibi-design.md §4.5–4.6, §5.2–5.5)
--
-- * appt_save / appt_remove: lab (ya da planlama öncesi hekim/klinik) doğrudan yazar; planlama
--   başladıktan sonra hekim/klinik değişikliği "önerilen tarih" olarak bekler, lab'a bildirim gider.
-- * appt_review: lab öneriyi onaylar ya da (not ile) reddeder; öneriyi yapana bildirim gider.
-- * Her yazım güvenilir aktivite kaydı bırakır (Sipariş Geçmişi okur).
-- * _order_appt_risk: yalnız onaylı randevular; prova klinikteyken tahmini teslimle.
-- * order_prova_snapshot: popup'ın tek kaynağı (rol süzgeçli); order_prova_flags: liste rozet/filtre.

-- ── Randevu riski (iç) ──────────────────────────────────────────────────────────────────────────
create or replace function public._order_appt_risk(p_order uuid)
 returns table(level text, takma_date date, effective_delivery date, projected boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_wo public.work_orders; v_today date; v_tz text; v_takma date; v_eff date;
  v_proj boolean := false; v_start date; v_rb date;
begin
  select * into v_wo from public.work_orders where id = p_order;
  if v_wo.id is null or v_wo.status::text in ('teslim_edildi', 'iptal') then return; end if;
  v_today := public.lab_today(v_wo.lab_id);
  v_tz    := public.lab_tz(v_wo.lab_id);
  select min(a.appt_date) into v_takma from public.order_appointments a
   where a.work_order_id = p_order and a.kind = 'takma' and a.removed_at is null
     and a.appt_date is not null and a.appt_date >= v_today;
  if v_takma is null then return; end if;

  v_eff := v_wo.delivery_date;
  if v_wo.hold_status = 'on_hold' and v_wo.hold_category = 'client_prova' and v_wo.delivery_date is not null then
    v_start := (v_wo.hold_started_at at time zone v_tz)::date;
    select max(public._prova_return_by(pr.id)) into v_rb from public.provas pr
     where pr.work_order_id = p_order and pr.status in ('gönderildi', 'onay_bekliyor');
    v_eff  := v_wo.delivery_date + greatest(coalesce(v_rb, v_today) - v_start, v_today - v_start, 0);
    v_proj := true;
  end if;

  level := case when v_eff is null then null
                when v_eff >= v_takma then 'yetismiyor'
                when v_takma - v_today <= 2 then 'yaklasiyor'
                else 'yetisir' end;
  takma_date := v_takma; effective_delivery := v_eff; projected := v_proj;
  return next;
end;
$function$;

-- güvenilir aktivite kaydı (iç; hata yazımı bozmaz)
create or replace function public._appt_log(p_action text, p_order uuid, p_meta jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_no text; v_lab uuid;
begin
  select order_number, lab_id into v_no, v_lab from public.work_orders where id = p_order;
  begin
    perform set_config('siman.trusted_log', 'on', true);
    perform public.log_activity(p_action, 'work_order', p_order, v_no, p_meta, v_lab, null);
    perform set_config('siman.trusted_log', '', true);
  exception when others then
    perform set_config('siman.trusted_log', '', true);
  end;
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

-- ── Randevu yazımı ───────────────────────────────────────────────────────────────────────────────
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

-- ── Okuma: popup ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.order_prova_snapshot(p_order uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_wo public.work_orders; v_lab boolean; v_mgr boolean; v_today date; v_res jsonb;
begin
  if not public.can_read_work_order(p_order) then
    raise exception 'Bu siparişi görme yetkiniz yok' using errcode = '42501';
  end if;
  select * into v_wo from public.work_orders where id = p_order;
  v_lab   := coalesce(public.is_platform_admin(), false) or coalesce(public.my_user_type(), '') in ('lab', 'admin');
  v_mgr   := public._prova_can_manage(p_order);
  v_today := public.lab_today(v_wo.lab_id);

  v_res := jsonb_build_object(
    'viewer', case when v_lab then 'lab' else 'client' end,
    'can_manage', v_mgr,
    'can_propose', not v_mgr and public._prova_client_can(p_order) and v_wo.status::text not in ('teslim_edildi', 'iptal'),
    'today', v_today,
    'delivery_date', v_wo.delivery_date,
    'risk', (select to_jsonb(r) from public._order_appt_risk(p_order) r),
    'provas', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', pr.id, 'number', pr.prova_number, 'type', pr.prova_type, 'item_name', pr.order_item_name,
               'status', pr.status, 'sent_date', pr.sent_date, 'return_date', pr.return_date,
               'return_by', public._prova_return_by(pr.id),
               'late_days', case when pr.status in ('gönderildi', 'onay_bekliyor')
                                  and v_today > public._prova_return_by(pr.id)
                                 then v_today - public._prova_return_by(pr.id) else 0 end,
               'days_at_clinic', case when pr.sent_date is null then null
                                      when pr.status in ('gönderildi', 'onay_bekliyor') then v_today - pr.sent_date + 1
                                      when pr.return_date is not null then pr.return_date - pr.sent_date
                                      else null end,
               'client_returned_at', pr.client_returned_at,
               'doctor_notes', pr.doctor_notes,
               'lab_notes', case when v_lab then pr.lab_notes else null end,
               'can_undo', v_mgr and pr.last_action is not null
                           and pr.last_action->>'source' = 'manual'
                           and pr.last_action->>'by' = auth.uid()::text
                           and (pr.last_action->>'at')::timestamptz >= now() - interval '10 minutes'))
             order by pr.prova_number)
        from public.provas pr where pr.work_order_id = p_order), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'kind', a.kind, 'appt_date', a.appt_date, 'appt_time', a.appt_time,
               'pending_action', a.pending_action, 'pending_date', a.pending_date, 'pending_time', a.pending_time,
               'pending_by_name', (select p.full_name from public.profiles p where p.id = a.pending_by),
               'review_note', a.review_note, 'reviewed_at', a.reviewed_at,
               'removed', a.removed_at is not null)
             order by coalesce(a.appt_date, a.pending_date), a.kind)
        from public.order_appointments a
       where a.work_order_id = p_order
         and (a.removed_at is null
              or (a.review_note is not null and a.reviewed_at >= now() - interval '7 days'))), '[]'::jsonb)
  );
  if v_lab then
    v_res := v_res || jsonb_build_object('counter_paused',
      v_wo.hold_status = 'on_hold' and v_wo.hold_category = 'client_prova');
  end if;
  return v_res;
end;
$function$;

-- ── Okuma: liste rozet ve filtre ──────────────────────────────────────────────────────────────────
create or replace function public.order_prova_flags()
 returns table(work_order_id uuid, prova_state text, prova_days integer, prova_late_days integer,
               risk_level text, effective_delivery date)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_ut text := coalesce(public.my_user_type(), ''); v_lab uuid := public.get_my_lab_id();
        v_role text := coalesce(public.my_role_key(), '');
begin
  return query
  with cand as (
    select wo.id, wo.lab_id from public.work_orders wo
     where wo.status::text not in ('teslim_edildi', 'iptal')
       and (exists (select 1 from public.provas p where p.work_order_id = wo.id and p.status in ('gönderildi', 'onay_bekliyor'))
            or exists (select 1 from public.order_appointments a where a.work_order_id = wo.id and a.kind = 'takma'
                          and a.removed_at is null and a.appt_date is not null))
  ),
  vis as (
    select c.* from cand c
     where (v_ut in ('lab', 'admin') and c.lab_id = v_lab
            and (v_role not in ('technician', 'courier') or public.can_see_work_order_id(c.id)))
        or (v_ut not in ('lab', 'admin') and public._prova_client_can(c.id))
  )
  select v.id,
         (select case when bool_or(p.status = 'gönderildi') then 'klinikte'
                      when bool_or(p.status = 'onay_bekliyor') then 'onay_bekliyor' end
            from public.provas p where p.work_order_id = v.id and p.status in ('gönderildi', 'onay_bekliyor')),
         (select max(public.lab_today(v.lab_id) - p.sent_date + 1)::integer
            from public.provas p where p.work_order_id = v.id and p.status in ('gönderildi', 'onay_bekliyor')),
         coalesce((select max(greatest(0, public.lab_today(v.lab_id) - public._prova_return_by(p.id)))::integer
                     from public.provas p where p.work_order_id = v.id and p.status in ('gönderildi', 'onay_bekliyor')), 0),
         r.level, r.effective_delivery
    from vis v
    left join lateral public._order_appt_risk(v.id) r on true;
end;
$function$;

-- ── Yetkiler ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._order_appt_risk(uuid)                        from public, anon, authenticated;
revoke all on function public._appt_log(text, uuid, jsonb)                  from public, anon, authenticated;
revoke all on function public._appt_label(text, date, time)                 from public, anon, authenticated;
revoke all on function public.appt_save(uuid, uuid, text, date, time)       from public, anon;
revoke all on function public.appt_remove(uuid)                             from public, anon;
revoke all on function public.appt_review(uuid, boolean, text)              from public, anon;
revoke all on function public.order_prova_snapshot(uuid)                    from public, anon;
revoke all on function public.order_prova_flags()                           from public, anon;
grant execute on function public.appt_save(uuid, uuid, text, date, time)    to authenticated;
grant execute on function public.appt_remove(uuid)                          to authenticated;
grant execute on function public.appt_review(uuid, boolean, text)           to authenticated;
grant execute on function public.order_prova_snapshot(uuid)                 to authenticated;
grant execute on function public.order_prova_flags()                        to authenticated;
