-- Açık kayıt (Instagram daveti) + "hesabınız açıldı" bildirimi — 2026-10-20
--
-- 1) labs.signup_hosts: lab'ın KENDİ alan adları (ör. www.nexadent.net). Bu
--    adreslerden açılan kayıt ekranı davet kodu SORMAZ; lab'ın public_join
--    kodu otomatik kullanılır → kayıt yine LAB ONAYINA düşer (clinic_auto_approve
--    kapalıysa). Alan, lab yöneticisi tarafından DEĞİŞTİRİLEMEZ (korumalı sütun):
--    bir lab kendi listesine 'siman.app' yazsaydı tüm siman.app kayıtlarını
--    kendine çekerdi.
-- 2) public_signup_lab_for_host(host): anon çağırabilir; host'a TEK bir lab
--    eşleşiyorsa lab adı + aktif public_join kodunu döndürür. Kod zaten herkese
--    açık bir katılım kodu (onaya düşer) — sır değil.
-- 3) _notify_account_opened: onaydan sonra uygulama içi bildirim + e-posta
--    (tercihlerden bağımsız, işlemsel) + WhatsApp (kategori 'account' →
--    hesap_acildi şablonu). Giriş linki lab'ın ilk signup_host'u, yoksa siman.app.
-- 4) _activate_signup_member: eski 'approval' bildirimi yerine yukarıdaki
--    helper. ('approval' WhatsApp'ta sipariş onayı şablonuna gidiyordu → yanlış mesaj.)
-- 5) trg_whatsapp_meta_notify: 'account' kategorisi listeye eklendi.

-- ── 1) sütun ─────────────────────────────────────────────────────────────
alter table public.labs
  add column if not exists signup_hosts text[] not null default '{}'::text[];

comment on column public.labs.signup_hosts is
  'Lab''ın kendi alan adları (küçük harf, şemasız). Bu adreslerden kayıt davet kodu sormaz; public_join koduyla onaya düşer. Yalnız platform tarafından yazılır.';

-- Korumalı sütun listesine ekle (canlı tanım + tek satır).
CREATE OR REPLACE FUNCTION public.labs_guard_protected_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_changed text[] := ARRAY[]::text[];
BEGIN
  -- Yalnız doğrudan istemci isteği kısıtlanır; SECURITY DEFINER RPC'ler,
  -- service_role ve postgres baypas eder (bkz. dosya başı).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id                  IS DISTINCT FROM OLD.id                  THEN v_changed := array_append(v_changed, 'id'); END IF;
  IF NEW.plan                IS DISTINCT FROM OLD.plan                THEN v_changed := array_append(v_changed, 'plan'); END IF;
  IF NEW.limit_overrides     IS DISTINCT FROM OLD.limit_overrides     THEN v_changed := array_append(v_changed, 'limit_overrides'); END IF;
  IF NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at       THEN v_changed := array_append(v_changed, 'trial_ends_at'); END IF;
  IF NEW.is_active           IS DISTINCT FROM OLD.is_active           THEN v_changed := array_append(v_changed, 'is_active'); END IF;
  IF NEW.owner_id            IS DISTINCT FROM OLD.owner_id            THEN v_changed := array_append(v_changed, 'owner_id'); END IF;
  IF NEW.slug                IS DISTINCT FROM OLD.slug                THEN v_changed := array_append(v_changed, 'slug'); END IF;
  IF NEW.pending_owner_email IS DISTINCT FROM OLD.pending_owner_email THEN v_changed := array_append(v_changed, 'pending_owner_email'); END IF;
  IF NEW.created_at          IS DISTINCT FROM OLD.created_at          THEN v_changed := array_append(v_changed, 'created_at'); END IF;
  IF NEW.signup_hosts        IS DISTINCT FROM OLD.signup_hosts        THEN v_changed := array_append(v_changed, 'signup_hosts'); END IF;

  IF cardinality(v_changed) > 0 THEN
    RAISE EXCEPTION 'labs: korumalı alan(lar) doğrudan güncellenemez: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501',
            HINT    = 'Abonelik/sahiplik değişiklikleri yalnız platform yönetim RPC''leri üzerinden yapılır.';
  END IF;

  RETURN NEW;
END;
$function$;

-- NexaDent: www ilk sırada (çıplak alan adı www'ye 307 yönlendiriyor → giriş linki www).
update public.labs
   set signup_hosts = array['www.nexadent.net', 'nexadent.net']
 where id = '243ef1db-9853-424b-8292-0025abfca436';

-- ── 2) host → lab + açık katılım kodu ───────────────────────────────────
create or replace function public._normalize_signup_host(p_host text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_host, ''))), '^[a-z]+://', ''),
      '[:/?#].*$', ''),
    '')
$$;

create or replace function public.public_signup_lab_for_host(p_host text)
returns table (lab_name text, code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text := public._normalize_signup_host(p_host);
  v_n    int;
  v_lab  uuid;
begin
  -- Platformun kendi adresleri hiçbir lab'a bağlanamaz (orada kod yine sorulur).
  if v_host is null
     or v_host = 'siman.app' or v_host like '%.siman.app'
     or v_host in ('localhost', '127.0.0.1') then
    return;
  end if;

  select count(*)::int, (array_agg(l.id))[1]
    into v_n, v_lab
    from public.labs l
   where v_host = any (l.signup_hosts)
     and coalesce(l.is_active, true);
  -- Belirsizlik (iki lab aynı host) → kimseye bağlama.
  if v_n <> 1 then
    return;
  end if;

  return query
    select l.name::text, c.code::text
      from public.labs l
      join public.lab_connect_codes c on c.lab_id = l.id
     where l.id = v_lab
       and c.kind = 'public_join'
       and c.active
       and (c.expires_at is null or c.expires_at > now())
       and (c.max_uses is null or c.uses < c.max_uses)
     order by c.created_at desc
     limit 1;
end;
$$;

revoke all on function public.public_signup_lab_for_host(text) from public;
grant execute on function public.public_signup_lab_for_host(text) to anon, authenticated;
revoke all on function public._normalize_signup_host(text) from public;

-- ── 3) hesap açıldı bildirimi ───────────────────────────────────────────
create or replace function public._notify_account_opened(p_profile uuid, p_lab uuid, p_membership uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lab    text;
  v_logo   text;
  v_host   text;
  v_login  text;
  v_name   text;
  v_notif  uuid;
  v_anon   text;
  v_secret text;
begin
  select l.name, l.logo_url, nullif(btrim(l.signup_hosts[1]), '')
    into v_lab, v_logo, v_host
    from public.labs l
   where l.id = p_lab;

  v_login := case when v_host is not null then 'https://' || v_host || '/login'
                  else 'https://siman.app/login' end;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.clinic_name), ''))
    into v_name
    from public.profiles p
   where p.id = p_profile;

  -- Uygulama içi (+ trg_whatsapp_meta_notify → hesap_acildi şablonu).
  -- action_url uygulama içinde kök; giriş linki payload'da (WhatsApp/e-posta için).
  insert into public.notifications (
    user_id, lab_id, category, title, body,
    resource_type, resource_id, action_url, payload
  ) values (
    p_profile, p_lab, 'account', 'Hesabınız açıldı', v_lab,
    'profile', p_profile, '/',
    jsonb_build_object(
      'membershipId', p_membership,
      'labName',      v_lab,
      'loginUrl',     v_login,
      'fullName',     v_name)
  )
  returning id into v_notif;

  -- E-posta: işlemsel → kullanıcının bildirim tercihlerinden bağımsız
  -- (send-email-notification 'account' + güvenilir çağrıda filtreyi atlar).
  begin
    select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'net_anon_key'     limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_fn_secret' limit 1;
    if v_anon is not null and v_secret is not null then
      perform net.http_post(
        url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
        headers := jsonb_build_object(
          'Content-Type',    'application/json',
          'Authorization',   'Bearer ' || v_anon,
          'apikey',          v_anon,
          'x-notify-secret', v_secret),
        body    := jsonb_build_object(
          'userIds',        jsonb_build_array(p_profile::text),
          'category',       'account',
          'notificationId', v_notif,
          'payload', jsonb_build_object(
            'title',     'Hesabınız açıldı',
            'body',      coalesce(v_lab, 'Laboratuvar') || ' hesabınız onaylandı ve kullanıma açıldı. Aşağıdaki butondan giriş yapabilirsiniz.',
            'actionUrl', v_login,
            'extra',     jsonb_build_object(
              'labName',    coalesce(v_lab, ''),
              'labLogoUrl', coalesce(v_logo, ''),
              'loginUrl',   v_login))));
    end if;
  exception when others then
    raise warning '_notify_account_opened(%): email % %', p_profile, sqlstate, sqlerrm;
  end;
end;
$$;

revoke all on function public._notify_account_opened(uuid, uuid, uuid) from public, anon, authenticated;

-- ── 4) onay → yeni bildirim (canlı tanım; yalnız son blok değişti) ───────
CREATE OR REPLACE FUNCTION public._activate_signup_member(p_membership uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m     record;
  v_p     record;
  v_perms jsonb;
begin
  select m.id, m.lab_id, m.member_profile_id, m.member_clinic_id, m.lab_clinic_id, m.status
    into v_m
    from public.clinic_lab_memberships m
   where m.id = p_membership
     for update;
  if not found or v_m.status <> 'active' or v_m.member_profile_id is null or v_m.lab_clinic_id is null then
    return null;
  end if;

  select p.id, p.user_type, p.clinic_id, p.role, p.clinic_permissions
    into v_p
    from public.profiles p
   where p.id = v_m.member_profile_id
     for update;
  if not found or v_p.user_type not in ('doctor', 'clinic_admin', 'clinic_secretary') then
    return null;
  end if;

  if v_p.clinic_id is not null then
    update public.clinic_lab_memberships
       set member_clinic_id = v_p.clinic_id
     where id = v_m.id
       and member_clinic_id is null;
    return null;
  end if;

  -- CRM kliniği gerçekten bu lab'ın satırı olmalı.
  if not exists (
    select 1 from public.clinics c where c.id = v_m.lab_clinic_id and c.lab_id = v_m.lab_id
  ) then
    return null;
  end if;

  -- admin-create-user'ın varsayılan klinik yetki şablonları ile aynı.
  v_perms := case v_p.user_type
    when 'clinic_admin' then jsonb_build_object(
      'orders_view', true, 'orders_create', true, 'orders_edit', true,
      'doctors_manage', true, 'users_manage', true, 'settings_manage', true, 'billing_view', true)
    when 'clinic_secretary' then jsonb_build_object(
      'orders_view', true, 'orders_create', true, 'orders_edit', true,
      'doctors_manage', false, 'users_manage', false, 'settings_manage', false, 'billing_view', true)
    else jsonb_build_object('orders_view', true, 'orders_create', true, 'orders_edit', true)
  end;

  update public.profiles
     set clinic_id          = v_m.lab_clinic_id,
         approval_status    = 'approved',
         is_active          = true,
         role               = case when user_type = 'clinic_admin' then coalesce(role, 'clinic_admin') else role end,
         clinic_permissions = case when coalesce(clinic_permissions, '{}'::jsonb) = '{}'::jsonb
                                   then v_perms else clinic_permissions end
   where id = v_p.id;

  update public.clinic_lab_memberships
     set member_clinic_id = coalesce(member_clinic_id, v_m.lab_clinic_id),
         approved_at      = coalesce(approved_at, now()),
         approved_by      = coalesce(approved_by, p_actor)
   where id = v_m.id;

  -- Hekim: doctors satırına açık bağ (yeni klinikte satır yoksa açar).
  if v_p.user_type = 'doctor' then
    begin
      perform public._link_doctor_profile(v_p.id, true);
    exception when others then
      raise warning '_activate_signup_member(%): doctor link % %', v_p.id, sqlstate, sqlerrm;
    end;
  end if;

  -- Hesap açıldı: uygulama içi + e-posta + WhatsApp (giriş linkiyle).
  begin
    perform public._notify_account_opened(v_p.id, v_m.lab_id, v_m.id);
  exception when others then
    raise warning '_activate_signup_member(%): notify % %', v_p.id, sqlstate, sqlerrm;
  end;

  return v_p.id;
end;
$function$;

-- ── 5) WhatsApp tetikleyicisi: 'account' (canlı tanım + kategori) ─────────
CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret text; v_anon text; v_wa_ok boolean;
BEGIN
  IF NEW.category NOT IN ('new_order','delivery','approval','payment','account') THEN RETURN NEW; END IF;
  -- Aşama/istasyon bildirimi → WhatsApp yok (uygulama içi + e-posta yeterli).
  IF NEW.payload ? 'stage_id' THEN RETURN NEW; END IF;
  IF NEW.category = 'payment' AND (NEW.payload ? 'reminder_id') THEN
    SELECT (payment_reminder_channels @> ARRAY['whatsapp']) INTO v_wa_ok FROM lab_settings WHERE lab_id = NEW.lab_id LIMIT 1;
    IF NOT COALESCE(v_wa_ok, false) THEN RETURN NEW; END IF;
  END IF;
  SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1;
  BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
  BEGIN
    PERFORM net.http_post(
      url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
      body := jsonb_build_object('userIds', jsonb_build_array(NEW.user_id::text),'category', NEW.category,
        'resource_type', COALESCE(NEW.resource_type,''),'resource_id', COALESCE(NEW.resource_id::text,''),
        'payload', COALESCE(NEW.payload,'{}'::jsonb) || jsonb_build_object('__body', COALESCE(NEW.body,''), '__lab_id', COALESCE(NEW.lab_id::text,''))));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;
