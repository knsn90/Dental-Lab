-- Prova türü: Geçici / Daimi. Lab provayı kliniğe gönderirken türü seçer; prova adı,
-- prova fişi başlığı, hekim seçenekleri ve kurye fişi amacı buna göre basılır.
-- Mevcut provalar NULL kalır (eski "Prova" adıyla görünür).

alter table public.provas add column if not exists prova_kind text;
alter table public.provas drop constraint if exists provas_prova_kind_check;
alter table public.provas add constraint provas_prova_kind_check check (prova_kind is null or prova_kind in ('gecici', 'daimi'));

-- Gönderirken tür (isteğe bağlı) — imza değiştiği için eskisi düşürülür (belirsiz aşırı yükleme olmasın).
drop function if exists public.prova_mark_sent(uuid, date);
create or replace function public.prova_mark_sent(p_prova uuid, p_day date default null, p_kind text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('gecici', 'daimi') then
    raise exception 'Geçersiz prova türü' using errcode = '22023';
  end if;
  if p_kind is not null then
    update public.provas set prova_kind = p_kind where id = p_prova;
  end if;
  perform public._prova_apply(p_prova, 'sent', p_day, null, 'manual');
end;
$function$;
revoke all on function public.prova_mark_sent(uuid, date, text) from public, anon;
grant execute on function public.prova_mark_sent(uuid, date, text) to authenticated, service_role;

-- Fiş penceresinden (gönderim öncesi/sonrası) türü değiştirme. NULL türü siler.
create or replace function public.prova_set_kind(p_prova uuid, p_kind text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('gecici', 'daimi') then
    raise exception 'Geçersiz prova türü' using errcode = '22023';
  end if;
  update public.provas set prova_kind = p_kind where id = p_prova;
end;
$function$;
revoke all on function public.prova_set_kind(uuid, text) from public, anon;
grant execute on function public.prova_set_kind(uuid, text) to authenticated, service_role;

-- Snapshot: provalara 'kind' alanı.
create or replace function public.order_prova_snapshot(p_order uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
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
               'id', pr.id, 'number', pr.prova_number, 'type', pr.prova_type, 'kind', pr.prova_kind, 'item_name', pr.order_item_name,
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
