-- =====================================================================
-- Ayarlar › Özellikler — lab yöneticisi kendi lab'ının YENİ modüllerini açıp kapatır
-- (kullanıcı, 2026-11-09: "bunlar için ayarlarda ayar ekleyelim yeni özellikler için").
--
-- Eskiden yalnız platform yöneticisi (admin_set_lab_flag, is_platform_admin) yazabiliyordu.
-- Yeni yol aynı kataloğu (platform_feature_flags) ve aynı lab ayar satırını (lab_feature_flags)
-- kullanır; my_feature_flags / lab_feature_enabled DEĞİŞMEZ.
--
-- Sınır: lab yalnız kataloğda lab_toggleable=true işaretli modülleri değiştirebilir. Finans/kurye
-- gibi çekirdek ya da platformun yönettiği (AI asistan, WhatsApp girişi…) modüller platformda kalır.
-- Yetki: hesap sahibi (user_type='admin') ya da lab müdürü (user_type='lab', role='manager'),
-- yalnız KENDİ lab'ı (get_my_lab_id). Her değişiklik platform_audit_log + activity_logs'a yazılır.
-- =====================================================================

alter table public.platform_feature_flags
  add column if not exists lab_toggleable boolean not null default false;

comment on column public.platform_feature_flags.lab_toggleable is
  'true: lab yöneticisi Ayarlar › Özellikler''den kendi lab''ı için açıp kapatabilir (lab_set_feature).';

update public.platform_feature_flags
   set lab_toggleable = true
 where key in ('phone_assistant', 'scan_appointments');

-- Lab'ın değiştirebileceği modüller + bu lab'daki durumu
create or replace function public.lab_feature_settings()
returns table(key text, label text, description text, default_on boolean, override boolean, effective boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_lab uuid := public.get_my_lab_id();
begin
  if v_lab is null or not (public.is_admin_user() or public.is_lab_manager()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select f.key, f.label, f.description, f.default_on, o.enabled, coalesce(o.enabled, f.default_on)
    from public.platform_feature_flags f
    left join public.lab_feature_flags o on o.key = f.key and o.lab_id = v_lab
   where f.lab_toggleable
   order by f.created_at desc, f.key;
end $function$;

-- Kendi lab'ında bir modülü aç/kapat
create or replace function public.lab_set_feature(p_key text, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lab   uuid := public.get_my_lab_id();
  v_label text;
  v_prev  boolean;
begin
  if v_lab is null or not (public.is_admin_user() or public.is_lab_manager()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'p_enabled zorunlu' using errcode = '22023';
  end if;

  select f.label into v_label
    from public.platform_feature_flags f
   where f.key = p_key and f.lab_toggleable;
  if not found then
    raise exception 'not_toggleable' using errcode = '42501';
  end if;

  v_prev := public.lab_feature_enabled(v_lab, p_key);
  if v_prev = p_enabled then
    return p_enabled;   -- değişiklik yok: kayıt/log da yok
  end if;

  insert into public.lab_feature_flags(lab_id, key, enabled)
  values (v_lab, p_key, p_enabled)
  on conflict (lab_id, key) do update set enabled = excluded.enabled;

  insert into public.platform_audit_log(actor_id, action, target_lab, detail)
  values (auth.uid(), 'lab_set_feature', v_lab,
          jsonb_build_object('key', p_key, 'enabled', p_enabled, 'previous', v_prev));

  perform public.log_activity(
    case when p_enabled then 'Modül aktif edildi' else 'Modül pasif edildi' end,
    'feature', null, coalesce(v_label, p_key),
    jsonb_build_object('key', p_key, 'enabled', p_enabled));

  return p_enabled;
end $function$;

revoke all on function public.lab_feature_settings() from public, anon;
revoke all on function public.lab_set_feature(text, boolean) from public, anon;
grant execute on function public.lab_feature_settings() to authenticated;
grant execute on function public.lab_set_feature(text, boolean) to authenticated;
