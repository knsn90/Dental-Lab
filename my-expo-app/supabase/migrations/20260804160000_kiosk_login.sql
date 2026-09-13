-- Tablet Giriş Kodu (Kiosk PIN) — Faz 0: şema + RLS + yönetim/çözümleme RPC'leri
-- Karar: kayıtlı tabletler + sadece kod (liste yok); 6 hane; kullanıcı kendi belirler;
-- 10 dk boşta-kilit (client tarafı). Mevcut e-posta/şifre girişi ETKİLENMEZ (additive).
--
-- Akış: cihaz eşleştirilir (pairing_code → device_token, hash'i saklanır) → kullanıcı kod
-- girer → edge function (service role) kiosk_resolve_user ile kullanıcıyı bulur →
-- admin.generateLink → istemci verifyOtp → gerçek oturum → doğru RLS.

create extension if not exists pgcrypto with schema extensions;

-- ═══════════════ lab_devices — kayıtlı tabletler ═══════════════
create table if not exists public.lab_devices (
  id                 uuid primary key default gen_random_uuid(),
  lab_id             uuid not null references public.labs(id) on delete cascade,
  name               text not null,
  device_token_hash  text,               -- ham jetonun SHA-256'sı; ham jeton yalnız tablette
  active             boolean not null default true,
  pairing_code       text,               -- tek kullanımlık; eşleşince temizlenir
  pairing_expires_at timestamptz,
  failed_attempts    int not null default 0,
  locked_until       timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz,
  revoked_at         timestamptz
);
create unique index if not exists uq_lab_devices_token on public.lab_devices(device_token_hash) where device_token_hash is not null;
create index if not exists idx_lab_devices_lab on public.lab_devices(lab_id);
create index if not exists idx_lab_devices_pairing on public.lab_devices(pairing_code) where pairing_code is not null;
alter table public.lab_devices enable row level security;

-- ═══════════════ staff_access_codes — kişisel giriş kodu (PIN) ═══════════════
create table if not exists public.staff_access_codes (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  lab_id          uuid,
  code_hash       text not null,          -- bcrypt (extensions.crypt); asla düz metin/istemciye
  active          boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_staff_codes_lab on public.staff_access_codes(lab_id) where active;
alter table public.staff_access_codes enable row level security;

-- ═══════════════ yetki yardımcısı (recursion'suz) ═══════════════
create or replace function public.kiosk_can_manage(p_lab_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.lab_id = p_lab_id
      and (p.user_type = 'admin' or (p.user_type = 'lab' and coalesce(p.role,'') in ('manager','admin')))
  );
$$;

-- ═══════════════ RLS politikaları ═══════════════
-- lab_devices: yalnız lab yöneticisi/admin kendi lab'ının cihazlarını görür/yönetir.
-- (device_token_hash bir SHA-256'dır; ham jeton türetilemez. Yazımlar RPC'ler üzerinden.)
drop policy if exists lab_devices_manage on public.lab_devices;
create policy lab_devices_manage on public.lab_devices
  for all using (public.kiosk_can_manage(lab_id)) with check (public.kiosk_can_manage(lab_id));

-- staff_access_codes: kullanıcı kendi satırını GÖRÜR (code_hash zaten hash); yönetici lab'ında
-- varlık görebilir (sıfırlama için). Yazımlar YALNIZ RPC (SECURITY DEFINER) üzerinden.
drop policy if exists sac_self_select on public.staff_access_codes;
create policy sac_self_select on public.staff_access_codes
  for select using (user_id = auth.uid());
drop policy if exists sac_manager_select on public.staff_access_codes;
create policy sac_manager_select on public.staff_access_codes
  for select using (public.kiosk_can_manage(lab_id));

-- ═══════════════ RPC: kullanıcı kendi kodunu belirler (6 hane) ═══════════════
create or replace function public.staff_set_my_code(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_lab uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Kod 6 haneli (rakam) olmalı'; end if;
  select lab_id into v_lab from public.profiles where id = auth.uid();
  insert into public.staff_access_codes(user_id, lab_id, code_hash, active, failed_attempts, locked_until, updated_at)
    values (auth.uid(), v_lab, crypt(p_code, gen_salt('bf')), true, 0, null, now())
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, lab_id = excluded.lab_id, active = true,
        failed_attempts = 0, locked_until = null, updated_at = now();
end; $$;

create or replace function public.staff_clear_my_code()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.staff_access_codes set active = false, updated_at = now() where user_id = auth.uid();
end; $$;

-- Admin/manager personelin kodunu SIFIRLAR (pasifler → kişi yeniden belirler; göremez)
create or replace function public.staff_reset_code(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lab uuid;
begin
  select lab_id into v_lab from public.staff_access_codes where user_id = p_user_id;
  if v_lab is null then select lab_id into v_lab from public.profiles where id = p_user_id; end if;
  if not public.kiosk_can_manage(v_lab) then raise exception 'forbidden'; end if;
  update public.staff_access_codes set active = false, failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = p_user_id;
end; $$;

-- ═══════════════ RPC: cihaz oluştur / yeniden eşleştir / iptal ═══════════════
create or replace function public.lab_device_create(p_name text)
returns table(id uuid, pairing_code text, pairing_expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare v_lab uuid; v_id uuid; v_code text; v_exp timestamptz;
begin
  select lab_id into v_lab from public.profiles where id = auth.uid();
  if not public.kiosk_can_manage(v_lab) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Cihaz adı gerekli'; end if;
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  v_exp  := now() + interval '15 minutes';
  insert into public.lab_devices(lab_id, name, pairing_code, pairing_expires_at, created_by)
    values (v_lab, trim(p_name), v_code, v_exp, auth.uid())
    returning lab_devices.id into v_id;
  return query select v_id, v_code, v_exp;
end; $$;

create or replace function public.lab_device_repair(p_id uuid)
returns table(pairing_code text, pairing_expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare v_lab uuid; v_code text; v_exp timestamptz;
begin
  select lab_id into v_lab from public.lab_devices where id = p_id;
  if not public.kiosk_can_manage(v_lab) then raise exception 'forbidden'; end if;
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  v_exp  := now() + interval '15 minutes';
  update public.lab_devices set pairing_code = v_code, pairing_expires_at = v_exp where id = p_id;
  return query select v_code, v_exp;
end; $$;

create or replace function public.lab_device_revoke(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lab uuid;
begin
  select lab_id into v_lab from public.lab_devices where id = p_id;
  if not public.kiosk_can_manage(v_lab) then raise exception 'forbidden'; end if;
  update public.lab_devices
    set active = false, revoked_at = now(), device_token_hash = null,
        pairing_code = null, pairing_expires_at = null
    where id = p_id;
end; $$;

-- ═══════════════ RPC: kod → kullanıcı çözümleyici (YALNIZ service_role / edge fn) ═══════════════
-- Cihaz-kapsamlı + hız-sınırlı. İstemciye AÇILMAZ (kod-oracle olur).
create or replace function public.kiosk_resolve_user(p_device_id uuid, p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_lab uuid; v_active boolean; v_locked timestamptz; v_fail int; r record;
  c_max_fail int := 8; c_lock interval := interval '10 minutes';
begin
  select lab_id, active, locked_until, failed_attempts
    into v_lab, v_active, v_locked, v_fail
    from public.lab_devices where id = p_device_id for update;
  if v_lab is null or not v_active then raise exception 'device_invalid'; end if;
  if v_locked is not null and v_locked > now() then raise exception 'device_locked'; end if;

  for r in select user_id, code_hash, locked_until from public.staff_access_codes
           where lab_id = v_lab and active
  loop
    if r.code_hash = crypt(p_code, r.code_hash) then
      if r.locked_until is not null and r.locked_until > now() then raise exception 'user_locked'; end if;
      update public.lab_devices set failed_attempts = 0, locked_until = null, last_seen_at = now() where id = p_device_id;
      update public.staff_access_codes set failed_attempts = 0, locked_until = null where user_id = r.user_id;
      return r.user_id;
    end if;
  end loop;

  update public.lab_devices
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= c_max_fail then now() + c_lock else locked_until end,
        last_seen_at = now()
    where id = p_device_id;
  raise exception 'no_match';
end; $$;

-- kiosk_resolve_user'a yalnız service_role erişsin (istemci ASLA)
revoke all on function public.kiosk_resolve_user(uuid, text) from public;
revoke all on function public.kiosk_resolve_user(uuid, text) from anon;
revoke all on function public.kiosk_resolve_user(uuid, text) from authenticated;
grant execute on function public.kiosk_resolve_user(uuid, text) to service_role;

comment on table public.lab_devices is 'Kiosk/tablet giriş kodu: kayıtlı güvenilir tabletler. device_token_hash = ham cihaz jetonunun SHA-256''sı (ham jeton yalnız tablette). Bkz. docs/KIOSK_LOGIN_PLAN.md';
comment on table public.staff_access_codes is 'Kiosk/tablet giriş kodu: kişisel 6 haneli PIN (bcrypt). Yalnız RPC ile yazılır; code_hash istemciye dönmez.';
