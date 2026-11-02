-- Bekleme: unutulan başlangıç ve bitiş sonradan, gününe göre girilir (denetim 2. dalga madde 13).
-- Spec: docs/superpowers/specs/2026-11-01-bekleme-geriye-donuk-design.md §4.1, §4.2, §4.6, §4.7
--
-- 1) work_order_holds.end_recorded_at — bitişin GİRİLDİĞİ an (Sipariş Geçmişi "sonradan girildi")
--    work_order_holds.end_source      — 'delivered' = teslimde otomatik kapandı
-- 2) hold_order(..., p_started_on)  — geçmiş gün; o günün başı (lab saat dilimi). Tarihsiz çağrı = bugün.
-- 3) resume_order(p_order, p_started_on, p_ended_on) — başlangıç yalnız geri çekilir; bitiş geçmiş gün olabilir.
--    Uzatma = bitiş günü − başlangıç günü (lab takvim günü). Yalnız hekim/klinik kaynaklı tarih kaydırır.
-- 4) Teslimde açık bekleme kaydı kapanır, teslim tarihi KAYMAZ (trg_wo_close_hold_on_delivery).
--
-- Sınırlar: gelecek gün yok · siparişin açıldığı günden önce yok · aynı siparişin önceki beklemesinin
-- (prova dahil) bittiği günden önce yok. Hata metni "<sabit>: GG.AA.YYYY" (istemci autoT önek eşleşmesi).
-- Eski imzalar DROP edilir (aşırı yükleme yok); yetkiler canlıdaki gibi: authenticated + service_role.

alter table public.work_order_holds
  add column if not exists end_recorded_at timestamptz,
  add column if not exists end_source text;

drop function if exists public.hold_order(uuid, text, text, text);

create function public.hold_order(
  p_order uuid,
  p_reason text,
  p_category text default 'client_other',
  p_responsible text default 'client',
  p_started_on date default null
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_wo public.work_orders; v_resp text; v_tz text; v_today date; v_floor date; v_prev date; v_at timestamptz;
begin
  select * into v_wo from public.work_orders where id = p_order for update;
  if v_wo.lab_id is null or v_wo.lab_id is distinct from get_my_lab_id() then
    raise exception 'Bu siparisi bekletme yetkiniz yok';
  end if;
  if v_wo.status::text in ('teslim_edildi', 'iptal') then
    raise exception 'Teslim edilmiş veya iptal edilmiş iş bekletilemez';
  end if;
  -- Eskiden sessizce dönüyordu; istemci yine de hekime "beklemede" bildirimi gönderiyordu.
  if v_wo.hold_status = 'on_hold' then
    raise exception 'İş zaten beklemede';
  end if;

  v_resp  := case when coalesce(p_responsible, 'client') = 'lab' then 'lab' else 'client' end;
  v_tz    := public.lab_tz(v_wo.lab_id);
  v_today := public.lab_today(v_wo.lab_id, now());

  if p_started_on is null or p_started_on = v_today then
    v_at := now();
  else
    if p_started_on > v_today then
      raise exception 'Bekleme başlangıcı gelecekte olamaz';
    end if;
    v_floor := public.lab_today(v_wo.lab_id, v_wo.created_at);
    if p_started_on < v_floor then
      raise exception 'Bekleme başlangıcı siparişin açıldığı günden önce olamaz: %', to_char(v_floor, 'DD.MM.YYYY');
    end if;
    select max(public.lab_today(v_wo.lab_id, h.ended_at)) into v_prev
      from public.work_order_holds h where h.work_order_id = p_order and h.ended_at is not null;
    if v_prev is not null and p_started_on < v_prev then
      raise exception 'Bekleme başlangıcı önceki beklemenin bittiği günden önce olamaz: %', to_char(v_prev, 'DD.MM.YYYY');
    end if;
    v_at := (p_started_on::timestamp at time zone v_tz);
  end if;

  update public.work_orders set
    hold_status      = 'on_hold',
    hold_reason      = nullif(btrim(p_reason), ''),
    hold_category    = p_category,
    hold_responsible = v_resp,
    hold_started_at  = v_at,
    hold_by          = auth.uid()
  where id = p_order;

  insert into public.work_order_holds(work_order_id, lab_id, reason, category, responsible, started_at, held_by)
  values (p_order, v_wo.lab_id, nullif(btrim(p_reason), ''), p_category, v_resp, v_at, auth.uid());
end $function$;

revoke all on function public.hold_order(uuid, text, text, text, date) from public, anon;
grant execute on function public.hold_order(uuid, text, text, text, date) to authenticated, service_role;

drop function if exists public.resume_order(uuid);

create function public.resume_order(
  p_order uuid,
  p_started_on date default null,
  p_ended_on date default null
) returns integer
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_lab uuid; v_started timestamptz; v_resp text; v_cat text; v_created timestamptz;
  v_tz text; v_today date; v_sday date; v_eday date; v_floor date; v_prev date;
  v_moved boolean := false; v_end timestamptz; v_days int; v_open uuid[];
begin
  select lab_id, hold_started_at, hold_responsible, hold_category, created_at
    into v_lab, v_started, v_resp, v_cat, v_created
  from public.work_orders where id = p_order for update;

  if v_lab is null or v_lab is distinct from get_my_lab_id() then
    raise exception 'Bu siparisi devam ettirme yetkiniz yok';
  end if;
  -- 20261027161000: prova beklemesi yalnız prova akışıyla (dönüş işareti) kapanır
  if v_cat = 'client_prova' then
    raise exception 'Prova beklemesi prova akışıyla kapanır' using errcode = 'P0001';
  end if;
  -- Eskiden 0 dönüyordu. Teslimde bekleme alanları temizlenir → teslimden sonra geriye dönük bitiş girilemez.
  if v_started is null then
    raise exception 'İş beklemede değil';
  end if;

  v_tz    := public.lab_tz(v_lab);
  v_today := public.lab_today(v_lab, now());
  v_sday  := public.lab_today(v_lab, v_started);

  -- Başlangıç düzeltmesi: yalnız daha erken bir güne
  if p_started_on is not null and p_started_on <> v_sday then
    if p_started_on > v_sday then
      raise exception 'Başlangıç yalnız daha erken bir güne çekilebilir: %', to_char(v_sday, 'DD.MM.YYYY');
    end if;
    v_floor := public.lab_today(v_lab, v_created);
    if p_started_on < v_floor then
      raise exception 'Bekleme başlangıcı siparişin açıldığı günden önce olamaz: %', to_char(v_floor, 'DD.MM.YYYY');
    end if;
    select max(public.lab_today(v_lab, h.ended_at)) into v_prev
      from public.work_order_holds h where h.work_order_id = p_order and h.ended_at is not null;
    if v_prev is not null and p_started_on < v_prev then
      raise exception 'Bekleme başlangıcı önceki beklemenin bittiği günden önce olamaz: %', to_char(v_prev, 'DD.MM.YYYY');
    end if;
    v_started := (p_started_on::timestamp at time zone v_tz);
    v_sday    := p_started_on;
    v_moved   := true;
  end if;

  v_eday := coalesce(p_ended_on, v_today);
  if v_eday > v_today then
    raise exception 'Bitiş günü gelecekte olamaz';
  end if;
  if v_eday < v_sday then
    raise exception 'Bitiş günü başlangıçtan önce olamaz: %', to_char(v_sday, 'DD.MM.YYYY');
  end if;
  v_end := case when v_eday = v_today then now()
                else greatest(v_started, ((v_eday + 1)::timestamp at time zone v_tz) - interval '1 second') end;

  -- 20261027165000: yalnız ŞU AN açık olan bekleme satır(lar)ı kapanır; aşağıdaki UPDATE'in tetiklediği
  -- prova beklemesi (trg_work_orders_prova_reopen) yeni satır açarsa o satıra dokunulmaz.
  select coalesce(array_agg(id), '{}') into v_open
    from public.work_order_holds where work_order_id = p_order and ended_at is null;

  v_days := v_eday - v_sday;
  if coalesce(v_resp, 'client') = 'client' and v_days > 0 then
    update public.work_orders set delivery_date = delivery_date + v_days where id = p_order;
  else
    v_days := 0;
  end if;

  update public.work_orders set
    hold_status = null, hold_reason = null, hold_category = null,
    hold_responsible = null, hold_started_at = null, hold_by = null
  where id = p_order;

  update public.work_order_holds set
    started_at      = case when v_moved then v_started else started_at end,
    ended_at        = v_end,
    extended_days   = v_days,
    resumed_by      = auth.uid(),
    end_recorded_at = now()
  where id = any(v_open);

  return v_days;
end $function$;

revoke all on function public.resume_order(uuid, date, date) from public, anon;
grant execute on function public.resume_order(uuid, date, date) to authenticated, service_role;

-- Teslimde açık bekleme kaydı kapanır; teslim tarihi kaydırılmaz (parça/onay ne zaman geldi bilinmiyor).
create or replace function public._close_open_holds_on_delivery()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  update public.work_order_holds set
    ended_at = now(), extended_days = 0, end_recorded_at = now(), end_source = 'delivered'
  where work_order_id = NEW.id and ended_at is null;
  return null;
end $function$;

revoke all on function public._close_open_holds_on_delivery() from public, anon, authenticated;

drop trigger if exists trg_wo_close_hold_on_delivery on public.work_orders;
create trigger trg_wo_close_hold_on_delivery
  after update of status, hold_status on public.work_orders
  for each row when (NEW.status = 'teslim_edildi'::work_order_status)
  execute function public._close_open_holds_on_delivery();
