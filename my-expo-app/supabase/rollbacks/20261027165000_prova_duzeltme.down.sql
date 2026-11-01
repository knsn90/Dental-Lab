-- Geri alma: 20261027165000_prova_duzeltme — 161000 / 164000 tanımları + provas yazım yetkileri

CREATE OR REPLACE FUNCTION public.resume_order(p_order uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_started timestamptz; v_resp text; v_days int; v_cat text;
BEGIN
  SELECT lab_id, hold_started_at, hold_responsible, hold_category
    INTO v_lab, v_started, v_resp, v_cat
  FROM work_orders WHERE id = p_order;

  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparisi devam ettirme yetkiniz yok';
  END IF;
  -- 20261027161000: prova beklemesi yalnız prova akışıyla (dönüş işareti) kapanır
  IF v_cat = 'client_prova' THEN
    RAISE EXCEPTION 'Prova beklemesi prova akışıyla kapanır' USING errcode = 'P0001';
  END IF;
  IF v_started IS NULL THEN RETURN 0; END IF;

  v_days := greatest(0, round(extract(epoch FROM (now() - v_started)) / 86400.0))::int;

  IF coalesce(v_resp,'client') = 'client' AND v_days > 0 THEN
    UPDATE work_orders SET delivery_date = delivery_date + v_days WHERE id = p_order;
  ELSE
    v_days := 0;
  END IF;

  UPDATE work_orders SET
    hold_status = NULL, hold_reason = NULL, hold_category = NULL,
    hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
  WHERE id = p_order;

  UPDATE work_order_holds SET
    ended_at = now(), extended_days = v_days, resumed_by = auth.uid()
  WHERE work_order_id = p_order AND ended_at IS NULL;

  RETURN v_days;
END $function$;

create or replace function public._prova_from_delivery(p_delivery uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_d record; v_lab uuid; v_day date; v_p uuid; v_sent date;
begin
  select id, work_order_id, purpose, delivered_at into v_d from public.deliveries where id = p_delivery;
  if v_d.work_order_id is null then return; end if;
  select lab_id into v_lab from public.work_orders where id = v_d.work_order_id;
  v_day := (coalesce(v_d.delivered_at, now()) at time zone public.lab_tz(v_lab))::date;

  if v_d.purpose = 'prova_gidis' then
    select id into v_p from public.provas
     where work_order_id = v_d.work_order_id and status = 'planlandı' order by prova_number limit 1;
    if v_p is null then
      if exists (select 1 from public.work_orders where id = v_d.work_order_id and status::text in ('teslim_edildi', 'iptal')) then
        return;
      end if;
      insert into public.provas(work_order_id, lab_id, prova_number, status, sent_date)
      values (v_d.work_order_id, v_lab,
              coalesce((select max(prova_number) from public.provas where work_order_id = v_d.work_order_id), 0) + 1,
              'planlandı', null)
      returning id into v_p;
    end if;
    perform public._prova_apply(v_p, 'sent', v_day, null, 'courier');
  elsif v_d.purpose = 'prova_donus' then
    select id, sent_date into v_p, v_sent from public.provas
     where work_order_id = v_d.work_order_id and status in ('gönderildi', 'onay_bekliyor')
     order by sent_date nulls last, prova_number limit 1;
    if v_p is null then return; end if;
    perform public._prova_apply(v_p, 'returned', greatest(v_day, coalesce(v_sent, v_day)), null, 'courier');
  end if;
end;
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
    perform public._prova_notify_lab(p_order,
      case p_kind when 'prova' then 'Prova randevusu önerisi' else 'Takma randevusu önerisi' end,
      'Onay bekliyor · #' || coalesce(v_wo.order_number, '?') || ' · ' || public._appt_label(p_kind, p_date, p_time));
  end if;

  perform public._appt_log(v_action, p_order, jsonb_build_object(
    'kind', p_kind, 'date', p_date, 'time', p_time, 'old_date', v_a.appt_date, 'appointment_id', v_id));
  return v_id;
end;
$function$;

grant insert, update, delete, truncate on public.provas to authenticated;
-- anon'un önceden yetkisi yoktu (.before.txt) — geri verilmez
