-- Telefon asistanı (AI) talepleri: her görüşmenin sonunda VPS'teki ses köprüsü
-- `voice-lead-intake` edge function'ı üzerinden bir kayıt yazar.
--
-- Güvenlik:
--   * Doğrudan INSERT/DELETE politikası YOK — yazma yalnız service_role ile
--     çalışan record_phone_lead() üzerinden olur.
--   * Okuma/güncelleme yalnız aynı lab'ın admin + lab müdürlerine (günlük
--     sipariş özetiyle aynı alıcı kümesi).
--   * lab_id her zaman labs(id)'e FK.
-- KVKK: arayan numarası ve konuşma dökümü kişisel veridir; saklama süresi
-- ayrıca belirlenecek (purge işi bu migration'da yok).

create table if not exists public.phone_leads (
  id              uuid primary key default gen_random_uuid(),
  lab_id          uuid not null references public.labs(id) on delete cascade,
  call_id         text not null unique,
  caller_number   text,
  contact_name    text,
  contact_phone   text,
  request         text,
  summary         text,
  wants_callback  boolean not null default false,
  language        text,
  transcript      jsonb not null default '[]'::jsonb,
  duration_sec    integer,
  status          text not null default 'new' check (status in ('new', 'called', 'closed')),
  handled_by      uuid references public.profiles(id) on delete set null,
  handled_at      timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists phone_leads_lab_created_idx on public.phone_leads (lab_id, created_at desc);

alter table public.phone_leads enable row level security;

drop policy if exists phone_leads_select on public.phone_leads;
create policy phone_leads_select on public.phone_leads
  for select to authenticated
  using (
    lab_id = public.get_my_lab_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
    )
  );

drop policy if exists phone_leads_update on public.phone_leads;
create policy phone_leads_update on public.phone_leads
  for update to authenticated
  using (
    lab_id = public.get_my_lab_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
    )
  )
  with check (lab_id = public.get_my_lab_id());

-- Kaydı yazar ve admin + lab müdürlerine tüm kanallardan bildirir.
-- Aynı call_id ikinci kez gelirse yeni kayıt/bildirim üretmez (idempotent).
create or replace function public.record_phone_lead(p_lab_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id      uuid;
  v_name    text := nullif(btrim(p_payload->>'contact_name'), '');
  v_phone   text := coalesce(nullif(btrim(p_payload->>'contact_phone'), ''), nullif(btrim(p_payload->>'caller_number'), ''));
  v_request text := nullif(btrim(p_payload->>'request'), '');
  v_summary text := nullif(btrim(p_payload->>'summary'), '');
  v_cb      boolean := coalesce((p_payload->>'wants_callback')::boolean, false);
  v_title   text;
  v_body    text;
  v_uid     uuid;
begin
  if p_lab_id is null or not exists (select 1 from public.labs where id = p_lab_id) then
    raise exception 'record_phone_lead: gecersiz lab';
  end if;
  if coalesce(p_payload->>'call_id', '') = '' then
    raise exception 'record_phone_lead: call_id zorunlu';
  end if;

  insert into public.phone_leads (
    lab_id, call_id, caller_number, contact_name, contact_phone, request, summary,
    wants_callback, language, transcript, duration_sec
  ) values (
    p_lab_id,
    left(p_payload->>'call_id', 64),
    left(nullif(btrim(p_payload->>'caller_number'), ''), 32),
    left(v_name, 120),
    left(nullif(btrim(p_payload->>'contact_phone'), ''), 32),
    left(v_request, 1000),
    left(v_summary, 2000),
    v_cb,
    left(nullif(btrim(p_payload->>'language'), ''), 8),
    coalesce(p_payload->'transcript', '[]'::jsonb),
    nullif(p_payload->>'duration_sec', '')::integer
  )
  on conflict (call_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.phone_leads where call_id = p_payload->>'call_id';
    return v_id;                                   -- tekrar gönderim: bildirim yok
  end if;

  v_title := 'Telefon talebi: ' || coalesce(v_name, v_phone, 'Bilinmeyen arayan');
  v_body  := concat_ws(E'\n',
    coalesce(v_request, v_summary, 'Görüşme kaydı'),
    case when v_phone is not null then 'Telefon: ' || v_phone end,
    case when v_cb then 'Geri arama istiyor' end);

  for v_uid in
    select p.id from public.profiles p
     where p.lab_id = p_lab_id
       and coalesce(p.is_active, true)
       and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
  loop
    perform public._notify_channels(
      v_uid, 'phone_lead', v_title, v_body, 'phone_lead', v_id, null,
      jsonb_build_object('lead_id', v_id, 'wants_callback', v_cb, 'phone', v_phone));
  end loop;

  return v_id;
end;
$function$;

revoke all on function public.record_phone_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_phone_lead(uuid, jsonb) to service_role;
