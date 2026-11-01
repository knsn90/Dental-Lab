-- 2. dalga 4 — Prova motoru (spec 2026-10-27-prova-takibi-design.md §4.1–4.4, §5.6)
--
-- * Prova klinikteyken (gönderildi / onay_bekliyor) sipariş mevcut bekleme yuvasında 'client_prova'
--   kategorisiyle bekler: teslim sayacı durur. Son prova dönünce bekleme kapanır ve teslim tarihi
--   klinikte geçen gün kadar (lab saat dilimine göre gün farkı) ileri kayar.
-- * Başka bir bekleme açıkken prova beklemesi açılmaz (sayaç zaten duruyor); o bekleme "Devam ettir"
--   ile kapanınca prova hâlâ klinikteyse prova beklemesi o an açılır (trg_work_orders_prova_reopen).
-- * resume_order prova beklemesini kapatmaz (yalnız prova akışı kapatır).
-- * Kurye prova bacağını teslim edince prova kendiliğinden işaretlenir (trg_deliveries_prova_auto);
--   hata kurye akışını asla bozmaz.
-- * Elle işaret geçmiş tarihli olabilir (≤ bugün); 10 dakika içinde aynı kullanıcı geri alabilir.

-- ── Bekleme senkronu (iç) ──────────────────────────────────────────────────────────────────────
create or replace function public._prova_hold_sync(p_order uuid, p_day date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wo public.work_orders; v_tz text; v_today date; v_at timestamptz;
  v_days integer := 0; v_clinic boolean;
begin
  select * into v_wo from public.work_orders where id = p_order for update;
  if v_wo.id is null then return 0; end if;
  v_tz    := public.lab_tz(v_wo.lab_id);
  v_today := public.lab_today(v_wo.lab_id);
  -- bugünün işareti şimdiki an; geçmiş günün işareti o günün öğlesi (lab saatiyle)
  v_at := case when p_day is null or p_day >= v_today then now()
               else ((p_day::timestamp + interval '12 hours') at time zone v_tz) end;
  v_clinic := exists (select 1 from public.provas
                       where work_order_id = p_order and status in ('gönderildi', 'onay_bekliyor'));

  if v_clinic and v_wo.hold_status is null and v_wo.status::text not in ('teslim_edildi', 'iptal') then
    update public.work_orders set
      hold_status = 'on_hold', hold_reason = null, hold_category = 'client_prova',
      hold_responsible = 'client', hold_started_at = v_at, hold_by = auth.uid()
     where id = p_order;
    insert into public.work_order_holds(work_order_id, lab_id, reason, category, responsible, started_at, held_by)
    values (p_order, v_wo.lab_id, null, 'client_prova', 'client', v_at, auth.uid());
  elsif not v_clinic and v_wo.hold_status = 'on_hold' and v_wo.hold_category = 'client_prova' then
    v_days := greatest(0, coalesce(p_day, v_today) - (v_wo.hold_started_at at time zone v_tz)::date);
    update public.work_orders set
      delivery_date    = case when delivery_date is null then null else delivery_date + v_days end,
      hold_status = null, hold_reason = null, hold_category = null,
      hold_responsible = null, hold_started_at = null, hold_by = null
     where id = p_order;
    update public.work_order_holds set
      ended_at = greatest(started_at, v_at), extended_days = v_days, resumed_by = auth.uid()
     where work_order_id = p_order and ended_at is null;
  end if;
  return v_days;
end;
$function$;

-- siparişin bekleme/teslim alanlarının anlık görüntüsü (geri al karşılaştırması için)
create or replace function public._prova_order_state(p_order uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
           'delivery_date', wo.delivery_date, 'hold_status', wo.hold_status, 'hold_reason', wo.hold_reason,
           'hold_category', wo.hold_category, 'hold_responsible', wo.hold_responsible,
           'hold_started_at', wo.hold_started_at, 'hold_by', wo.hold_by)
    from public.work_orders wo where wo.id = p_order;
$function$;

-- ── Ortak işaret çekirdeği (iç): gönderildi / döndü ──────────────────────────────────────────────
create or replace function public._prova_apply(p_prova uuid, p_kind text, p_day date, p_note text, p_source text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pr public.provas; v_wo public.work_orders; v_today date; v_day date;
  v_before jsonb; v_open_before uuid; v_open_after uuid; v_hold_row jsonb;
begin
  select * into v_pr from public.provas where id = p_prova for update;
  if v_pr.id is null then raise exception 'Prova bulunamadı' using errcode = 'P0002'; end if;
  select * into v_wo from public.work_orders where id = v_pr.work_order_id for update;
  v_today := public.lab_today(v_wo.lab_id);
  v_day   := coalesce(p_day, v_today);
  if v_day > v_today then raise exception 'İleri bir tarih seçilemez' using errcode = '22023'; end if;

  if p_kind = 'sent' then
    if v_pr.status <> 'planlandı' then raise exception 'Prova gönderilmeye hazır değil' using errcode = 'P0001'; end if;
    if v_wo.status::text in ('teslim_edildi', 'iptal') then
      raise exception 'Teslim edilmiş ya da iptal edilmiş siparişte prova gönderilemez' using errcode = 'P0001';
    end if;
  elsif p_kind = 'returned' then
    if v_pr.status not in ('gönderildi', 'onay_bekliyor') then raise exception 'Prova klinikte değil' using errcode = 'P0001'; end if;
    if v_pr.sent_date is not null and v_day < v_pr.sent_date then
      raise exception 'Dönüş günü gönderim gününden önce olamaz' using errcode = '22023';
    end if;
  else
    raise exception 'Geçersiz işaret' using errcode = '22023';
  end if;

  v_before := public._prova_order_state(v_wo.id);
  select id into v_open_before from public.work_order_holds
   where work_order_id = v_wo.id and ended_at is null order by started_at desc limit 1;

  if p_kind = 'sent' then
    update public.provas set status = 'gönderildi', sent_date = v_day, return_date = null where id = p_prova;
  else
    update public.provas set status = 'döndü', return_date = v_day,
           doctor_notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), doctor_notes)
     where id = p_prova;
  end if;

  perform public._prova_hold_sync(v_wo.id, v_day);

  select id into v_open_after from public.work_order_holds
   where work_order_id = v_wo.id and ended_at is null order by started_at desc limit 1;
  v_hold_row := case
    when v_open_before is null and v_open_after is not null then jsonb_build_object('id', v_open_after, 'action', 'opened')
    when v_open_before is not null and v_open_after is null then jsonb_build_object('id', v_open_before, 'action', 'closed')
    else null end;

  update public.provas set last_action = jsonb_build_object(
      'at', now(), 'by', auth.uid(), 'source', p_source, 'kind', p_kind,
      'prev', jsonb_build_object('status', v_pr.status, 'sent_date', v_pr.sent_date, 'return_date', v_pr.return_date,
                                 'doctor_notes', v_pr.doctor_notes),
      'order', v_before,
      'after', public._prova_order_state(v_wo.id),
      'hold_row', v_hold_row)
   where id = p_prova;
end;
$function$;

-- ── RPC'ler ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.prova_create(p_order uuid, p_item_id uuid default null,
                                               p_item_name text default null, p_type text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_wo public.work_orders; v_id uuid;
begin
  if not public._prova_can_manage(p_order) then
    raise exception 'Bu siparişte prova yönetme yetkiniz yok' using errcode = '42501';
  end if;
  select * into v_wo from public.work_orders where id = p_order for update;
  if v_wo.status::text in ('teslim_edildi', 'iptal') then
    raise exception 'Teslim edilmiş ya da iptal edilmiş siparişe prova eklenemez' using errcode = 'P0001';
  end if;
  insert into public.provas(work_order_id, lab_id, prova_number, status, sent_date, order_item_id, order_item_name,
                            prova_type, created_by)
  values (p_order, v_wo.lab_id,
          coalesce((select max(prova_number) from public.provas where work_order_id = p_order), 0) + 1,
          'planlandı', null, p_item_id, nullif(btrim(coalesce(p_item_name, '')), ''),
          nullif(btrim(coalesce(p_type, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.prova_mark_sent(p_prova uuid, p_day date default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  perform public._prova_apply(p_prova, 'sent', p_day, null, 'manual');
end;
$function$;

create or replace function public.prova_mark_returned(p_prova uuid, p_day date default null, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  perform public._prova_apply(p_prova, 'returned', p_day, p_note, 'manual');
end;
$function$;

-- Hekim / klinik: "Provayı geri gönderdim" — lab teslim alana kadar onay_bekliyor (sayaç durur).
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

create or replace function public.prova_set_note(p_prova uuid, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  update public.provas set doctor_notes = nullif(btrim(coalesce(p_note, '')), '') where id = p_prova;
end;
$function$;

-- Geri al: yalnız son ELLE işaret, aynı kullanıcı, 10 dakika içinde ve sipariş o arada değişmediyse.
create or replace function public.prova_undo(p_prova uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_pr public.provas; v_la jsonb; v_o jsonb; v_h jsonb; v_expect text;
begin
  select * into v_pr from public.provas where id = p_prova for update;
  if v_pr.id is null or not public._prova_can_manage(v_pr.work_order_id) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  v_la := v_pr.last_action;
  if v_la is null or v_la->>'source' is distinct from 'manual'
     or (v_la->>'by') is distinct from auth.uid()::text
     or (v_la->>'at')::timestamptz < now() - interval '10 minutes' then
    raise exception 'Bu işaret artık geri alınamaz' using errcode = 'P0001';
  end if;
  v_expect := case when (v_la->>'kind') = 'sent' then 'gönderildi' else 'döndü' end;
  if v_pr.status is distinct from v_expect
     or public._prova_order_state(v_pr.work_order_id) is distinct from (v_la->'after') then
    raise exception 'Sipariş o arada değişti; geri alınamaz' using errcode = 'P0001';
  end if;

  perform 1 from public.work_orders where id = v_pr.work_order_id for update;
  v_o := v_la->'order';
  v_h := v_la->'hold_row';
  update public.provas set
    status = v_la->'prev'->>'status',
    sent_date = (v_la->'prev'->>'sent_date')::date,
    return_date = (v_la->'prev'->>'return_date')::date,
    doctor_notes = v_la->'prev'->>'doctor_notes',
    last_action = null
   where id = p_prova;
  update public.work_orders set
    delivery_date    = (v_o->>'delivery_date')::date,
    hold_status      = v_o->>'hold_status',
    hold_reason      = v_o->>'hold_reason',
    hold_category    = v_o->>'hold_category',
    hold_responsible = v_o->>'hold_responsible',
    hold_started_at  = (v_o->>'hold_started_at')::timestamptz,
    hold_by          = (v_o->>'hold_by')::uuid
   where id = v_pr.work_order_id;
  if v_h is not null then
    if v_h->>'action' = 'opened' then
      delete from public.work_order_holds where id = (v_h->>'id')::uuid;
    elsif v_h->>'action' = 'closed' then
      update public.work_order_holds set ended_at = null, extended_days = 0, resumed_by = null
       where id = (v_h->>'id')::uuid;
    end if;
  end if;
end;
$function$;

-- ── Kurye bacağı → prova işareti (iç) ────────────────────────────────────────────────────────────
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

create or replace function public.trg_deliveries_prova_fn()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform public._prova_from_delivery(new.id);
  exception when others then
    null;  -- kurye teslim akışı prova işaretinden dolayı asla bozulmaz
  end;
  return null;
end;
$function$;

drop trigger if exists trg_deliveries_prova_auto on public.deliveries;
create trigger trg_deliveries_prova_auto
  after update of status on public.deliveries
  for each row
  when (new.status = 'teslim_edildi' and old.status is distinct from new.status
        and new.purpose in ('prova_gidis', 'prova_donus'))
  execute function public.trg_deliveries_prova_fn();

-- Başka bir bekleme kapanınca prova hâlâ klinikteyse prova beklemesi o an açılır (sayaç durmaya devam eder).
create or replace function public.trg_prova_reopen_fn()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.provas
              where work_order_id = new.id and status in ('gönderildi', 'onay_bekliyor')) then
    perform public._prova_hold_sync(new.id, public.lab_today(new.lab_id));
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_work_orders_prova_reopen on public.work_orders;
create trigger trg_work_orders_prova_reopen
  after update of hold_status on public.work_orders
  for each row
  when (old.hold_status = 'on_hold' and new.hold_status is null
        and old.hold_category is distinct from 'client_prova'
        and new.status::text not in ('teslim_edildi', 'iptal'))
  execute function public.trg_prova_reopen_fn();

-- ── resume_order: prova beklemesini kapatmaz (canlı tanım + koruma) ───────────────────────────────
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

-- ── Yetkiler ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._prova_hold_sync(uuid, date)                  from public, anon, authenticated;
revoke all on function public._prova_order_state(uuid)                      from public, anon, authenticated;
revoke all on function public._prova_apply(uuid, text, date, text, text)    from public, anon, authenticated;
revoke all on function public._prova_from_delivery(uuid)                    from public, anon, authenticated;
revoke all on function public.trg_deliveries_prova_fn()                     from public, anon, authenticated;
revoke all on function public.trg_prova_reopen_fn()                         from public, anon, authenticated;
revoke all on function public.prova_create(uuid, uuid, text, text)          from public, anon;
revoke all on function public.prova_mark_sent(uuid, date)                   from public, anon;
revoke all on function public.prova_mark_returned(uuid, date, text)         from public, anon;
revoke all on function public.prova_client_returned(uuid)                   from public, anon;
revoke all on function public.prova_set_note(uuid, text)                    from public, anon;
revoke all on function public.prova_undo(uuid)                              from public, anon;
grant execute on function public.prova_create(uuid, uuid, text, text)       to authenticated;
grant execute on function public.prova_mark_sent(uuid, date)                to authenticated;
grant execute on function public.prova_mark_returned(uuid, date, text)      to authenticated;
grant execute on function public.prova_client_returned(uuid)                to authenticated;
grant execute on function public.prova_set_note(uuid, text)                 to authenticated;
grant execute on function public.prova_undo(uuid)                           to authenticated;
