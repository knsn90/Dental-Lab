-- =====================================================================
-- (A) Özellik bayrağı sistemi — CANLIDA ZATEN VAR; repo ile eşitleme (idempotent).
--     Tanımlar 2026-10-09'da canlıdan pg_get_functiondef ile alındı. Canlıda değişiklik yok.
-- =====================================================================
create table if not exists public.platform_feature_flags (
  key         text primary key,
  label       text,
  description text,
  default_on  boolean not null default false,
  created_at  timestamptz not null default now()
);
create table if not exists public.lab_feature_flags (
  lab_id  uuid not null references public.labs(id) on delete cascade,
  key     text not null references public.platform_feature_flags(key) on delete cascade,
  enabled boolean not null,
  primary key (lab_id, key)
);
alter table public.platform_feature_flags enable row level security;
alter table public.lab_feature_flags enable row level security;

CREATE OR REPLACE FUNCTION public.admin_lab_flags(p_lab uuid)
 RETURNS TABLE(key text, label text, description text, default_on boolean, override boolean, effective boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  RETURN QUERY
  SELECT f.key,f.label,f.description,f.default_on,o.enabled,COALESCE(o.enabled,f.default_on)
  FROM platform_feature_flags f LEFT JOIN lab_feature_flags o ON o.key=f.key AND o.lab_id=p_lab
  ORDER BY f.key;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_lab_flag(p_lab uuid, p_key text, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  INSERT INTO lab_feature_flags(lab_id,key,enabled) VALUES (p_lab,p_key,p_enabled)
  ON CONFLICT (lab_id,key) DO UPDATE SET enabled=excluded.enabled;
  INSERT INTO platform_audit_log(actor_id,action,target_lab,detail)
  VALUES (auth.uid(),'set_lab_flag',p_lab,jsonb_build_object('key',p_key,'enabled',p_enabled));
  RETURN p_enabled;
END $function$;

CREATE OR REPLACE FUNCTION public.my_feature_flags()
 RETURNS TABLE(key text, enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT f.key, COALESCE(o.enabled, f.default_on)
  FROM platform_feature_flags f
  LEFT JOIN lab_feature_flags o ON o.key=f.key AND o.lab_id = get_my_lab_id();
$function$;

-- =====================================================================
-- (B) Telefon Asistanı modülü (kullanıcı onayı 2026-10-09)
--     Varsayılan KAPALI; platform panelindeki "Özellik bayrakları" kartından lab bazında açılır.
-- =====================================================================
insert into public.platform_feature_flags (key, label, description, default_on)
values ('phone_assistant', 'Telefon asistanı',
        'Yapay zekâ telefon asistanı: telefon talepleri ekranı, talep kaydı ve bildirimleri', false)
on conflict (key) do nothing;

-- Nexadent bu modülü kullanıyor
insert into public.lab_feature_flags (lab_id, key, enabled)
values ('243ef1db-9853-424b-8292-0025abfca436', 'phone_assistant', true)
on conflict (lab_id, key) do update set enabled = excluded.enabled;

-- Sunucu tarafı bayrak kontrolü (RLS ve RPC'ler için)
create or replace function public.lab_feature_enabled(p_lab uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select o.enabled from public.lab_feature_flags o where o.lab_id = p_lab and o.key = p_key),
    (select f.default_on from public.platform_feature_flags f where f.key = p_key),
    false);
$function$;

-- Görme: aynı lab + admin/müdür + modül açık
drop policy if exists phone_leads_select on public.phone_leads;
create policy phone_leads_select on public.phone_leads
  for select to authenticated
  using (
    lab_id = public.get_my_lab_id()
    and public.lab_feature_enabled(lab_id, 'phone_assistant')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
    )
  );

-- Doğrudan UPDATE kapatılıyor (müdür döküm dahil her kolonu değiştirebiliyordu);
-- durum/not değişikliği yalnız set_phone_lead_status() ile.
drop policy if exists phone_leads_update on public.phone_leads;

create or replace function public.set_phone_lead_status(p_id uuid, p_status text, p_note text default null)
returns public.phone_leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead public.phone_leads;
  v_ok   boolean;
begin
  if p_status not in ('new', 'called', 'closed') then
    raise exception 'gecersiz durum' using errcode = '22023';
  end if;

  select * into v_lead from public.phone_leads where id = p_id;
  if not found then raise exception 'kayit yok' using errcode = 'P0002'; end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.lab_id = v_lead.lab_id
      and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
  ) into v_ok;
  if not v_ok or not public.lab_feature_enabled(v_lead.lab_id, 'phone_assistant') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.phone_leads
     set status     = p_status,
         note       = case when p_note is null then note else nullif(left(btrim(p_note), 2000), '') end,
         handled_by = case when p_status = 'new' then null else auth.uid() end,
         handled_at = case when p_status = 'new' then null else now() end
   where id = p_id
  returning * into v_lead;

  return v_lead;
end;
$function$;

revoke all on function public.set_phone_lead_status(uuid, text, text) from public, anon;
grant execute on function public.set_phone_lead_status(uuid, text, text) to authenticated;

-- Kayıt fonksiyonu: modül kapalıysa kayıt yok; bildirim linki panelden bağımsız (/phone-leads/<id>)
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
  -- Modül kapalı lab'a kayıt yazılmaz (platform panelinden açılıp kapatılır)
  if not public.lab_feature_enabled(p_lab_id, 'phone_assistant') then
    return null;
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
    return v_id;
  end if;

  -- Konu satırı: talep + kim. Örn. "Telefon talebi: Zirkon kron fiyatı bilgisi – Kaan Esen"
  v_title := 'Telefon talebi: ' || coalesce(left(v_request, 80), 'Görüşme kaydı')
             || ' – ' || coalesce(v_name, v_phone, 'Bilinmeyen arayan');
  v_body  := concat_ws(E'\n',
    coalesce(v_summary, v_request, 'Görüşme kaydı'),
    case when v_phone is not null then 'Telefon: ' || v_phone end,
    case when v_cb then 'Geri arama istiyor' end);

  for v_uid in
    select p.id from public.profiles p
     where p.lab_id = p_lab_id
       and coalesce(p.is_active, true)
       and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
       and coalesce((p.notification_prefs->'categories'->'phone_lead'->>'in_app')::boolean, true)
  loop
    perform public._notify_channels(
      v_uid, 'phone_lead', v_title, v_body, 'phone_lead', v_id, '/phone-leads/' || v_id::text,
      jsonb_build_object('lead_id', v_id, 'wants_callback', v_cb, 'phone', v_phone));
  end loop;

  return v_id;
end;
$function$;

revoke all on function public.record_phone_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_phone_lead(uuid, jsonb) to service_role;

-- Ekran canlı güncellensin
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'phone_leads') then
    alter publication supabase_realtime add table public.phone_leads;
  end if;
end $$;
