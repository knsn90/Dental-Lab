-- Geri alma: 20261122160000_kiosk_code_hardening
-- DİKKAT: kiosk-login edge fonksiyonu da eski sürüme dönmeli (2 argümanlı çağrı).

DROP FUNCTION IF EXISTS public.kiosk_resolve_user(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.kiosk_list_users(uuid);
DROP FUNCTION IF EXISTS public.staff_set_my_code(text, text);
DROP FUNCTION IF EXISTS public._kiosk_code_is_weak(text);

CREATE OR REPLACE FUNCTION public.kiosk_resolve_user(p_device_id uuid, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
end; $function$;
REVOKE ALL ON FUNCTION public.kiosk_resolve_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_resolve_user(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_set_my_code(p_code text, p_old_code text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_lab uuid; v_hash text; v_active boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Kod 6 haneli (rakam) olmalı'; end if;
  select p.lab_id into v_lab from public.profiles p where p.id = auth.uid();
  select s.code_hash, s.active into v_hash, v_active
    from public.staff_access_codes s where s.user_id = auth.uid();
  if v_hash is not null and coalesce(v_active, false) then
    if p_old_code is null or p_old_code !~ '^[0-9]{6}$' or crypt(p_old_code, v_hash) <> v_hash then
      raise exception 'old_code_mismatch';
    end if;
  end if;
  insert into public.staff_access_codes(user_id, lab_id, code_hash, active, failed_attempts, locked_until, updated_at)
    values (auth.uid(), v_lab, crypt(p_code, gen_salt('bf')), true, 0, null, now())
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, lab_id = excluded.lab_id, active = true,
        failed_attempts = 0, locked_until = null, updated_at = now();
end; $function$;
GRANT EXECUTE ON FUNCTION public.staff_set_my_code(text, text) TO authenticated;
