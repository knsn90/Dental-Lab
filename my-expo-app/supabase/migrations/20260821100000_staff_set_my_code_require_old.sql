-- ═══════════════ Güvenlik: kodu DEĞİŞTİRMEK için eski kod şart ═══════════════
-- Önceki staff_set_my_code(text) mevcut kodu sormadan üzerine yazıyordu → açık kalan
-- tablette biri başkasının PIN'ini ele geçirebiliyordu. Artık aktif bir kod VARSA,
-- yeni kod belirlemek için mevcut (eski) kodun doğru girilmesi gerekir.
-- İLK kez belirlerken veya admin sıfırladıktan sonra (aktif kod yok) eski kod istenmez.
drop function if exists public.staff_set_my_code(text);

create or replace function public.staff_set_my_code(p_code text, p_old_code text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_lab uuid; v_hash text; v_active boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Kod 6 haneli (rakam) olmalı'; end if;
  select p.lab_id into v_lab from public.profiles p where p.id = auth.uid();

  -- Mevcut AKTİF kod varsa → eski kod doğrulaması zorunlu
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
end; $$;

grant execute on function public.staff_set_my_code(text, text) to authenticated, service_role;
