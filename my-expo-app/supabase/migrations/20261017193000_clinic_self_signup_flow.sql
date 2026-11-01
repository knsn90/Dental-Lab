-- =============================================================================
-- Hekim / klinik yöneticisi public kaydı: kayıt → lab bağlantı kodu → lab onayı
-- =============================================================================
-- Önkoşul (canlıda 2026-10-17'de uygulandı, başka dallarda):
--   20261017150000_labs_update_managers_only        (can_manage_lab_settings)
--   20261017160000_profiles_guard_privileged_columns (istemci clinic_id/onay yazamaz)
--   20261017180000_doctor_account_auto_link          (_link_doctor_profile)
--
-- SORUN (canlıda doğrulandı, 2026-10-17)
--   • auth.users üzerinde handle_new_user'ı çağıran tetikleyici YOKTU → public
--     kayıt profil satırı üretmiyordu (Ekim'de bir hekim kaydı profilsiz kaldı).
--   • İstemcinin kayıt sonrası clinics/doctors insert'i RLS'e, profil update'i
--     guard'a takılıyordu; zaten e-posta OTP öncesi oturum yok.
--   • Lab yöneticisi bağsız hekim profilini göremiyor, onay düz UPDATE ile
--     sessizce 0 satır güncelliyordu; profiles.clinic_id'yi atayan yol yoktu.
--   • notify_admins_on_new_user bekleyen kaydı TÜM lablardaki yöneticilere
--     bildiriyordu (ad/telefon/klinik çapraz-kiracı sızıntısı).
--
-- AKIŞ
--   1. signUp metadata'sı: user_type/full_name/clinic_name/phone + connect_code,
--      address, clinic_type. on_auth_user_created → handle_new_user (DEĞİŞMEDİ:
--      metadata kiracı/onay/aktiflik belirleyemez) → pending, clinic_id NULL profil.
--      'lab' tipli public kayıt için profil AÇILMAZ (lablar konsoldan açılır).
--   2. E-posta OTP sonrası istemci clinic_signup_connect(kod) çağırır →
--      _clinic_connect: lab'da CRM kliniği + üyelik (member_profile_id = hesap).
--      • davet kodu (tek kullanımlık) ya da lab'da otomatik onay açık → üyelik
--        aktif → hesap AYNI ANDA açılır;
--      • public kod → üyelik pending → yalnız O lab'ın yöneticilerine bildirim.
--   3. Lab yöneticisi lab_signup_requests() ile bekleyenleri görür,
--      lab_approve_clinic(üyelik) ile onaylar → _activate_signup_member:
--      profil approved + aktif, clinic_id = lab'ın CRM kliniği, varsayılan klinik
--      yetkileri, hekimse _link_doctor_profile(p, true) ile doctor_id; kullanıcıya
--      "Hesabınız onaylandı" bildirimi.
--
-- GÜVENLİK
--   • Kiracı/onay yalnız DEFINER yollarında atanır; değer istemciden gelmez:
--     klinik = sunucunun açtığı CRM satırı, lab = kodun lab'ı.
--   • Onay / red / yeniden açma yalnız can_manage_lab_settings() (teknisyen ve
--     kurye artık onaylayamaz) ve yalnız kendi lab'ının üyeliği.
--   • _activate_signup_member ve _signup_notify_lab_managers: EXECUTE yalnız
--     postgres + service_role.
--   • Bekleyen hesap (clinic_id NULL, lab_id NULL) hiçbir kiracı verisi görmez
--     (doğrulama: tablo-tablo görünürlük sayımı). Sayım approvals'ta bir sızıntı
--     buldu (all_approvals her hekime tüm lab'lar) → 11. adımda kapatıldı.
--   • _guard_clinic_user_update INVOKER'a çevrildi (5b): DEFINER iken çağıran
--     klinik yöneticisiyse sunucu yollarını da engelliyordu.
-- =============================================================================

-- 1) Kayıt tetikleyicisi --------------------------------------------------------
-- handle_new_user'a dokunulmaz (2026-09-14 güven sınırı düzeltmesi aynen geçerli).
-- admin-create-user profili UPSERT ile yazar → tetikleyicinin açtığı satırı günceller.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  when ((new.raw_user_meta_data ->> 'user_type') is distinct from 'lab')
  execute function public.handle_new_user();

-- 2) Yeni kullanıcı bildirimi: yalnız aynı lab -----------------------------------
create or replace function public.notify_admins_on_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_admin RECORD;
  v_title TEXT;
  v_body  TEXT;
  v_action_url TEXT;
  v_payload jsonb;
BEGIN
  -- Sadece pending durumdaki yeni kullanıcılar için bildirim üret
  IF NEW.approval_status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  -- Lab'ı belli olmayan kayıt hiçbir lab'a bildirilmez (eskiden TÜM lablara
  -- gidiyordu). Public klinik kaydı lab'ını bağlantı koduyla seçer; bildirim
  -- o anda yalnız o lab'a gider (_clinic_connect).
  IF NEW.lab_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- user_type'a göre başlık + deep link
  IF NEW.user_type = 'doctor' THEN
    v_title := 'Yeni doktor kaydı: ' || COALESCE(NEW.full_name, 'İsimsiz');
    v_action_url := '/(admin)/users?tab=pending';
  ELSIF NEW.user_type = 'clinic_admin' THEN
    v_title := 'Yeni klinik admin kaydı: ' || COALESCE(NEW.full_name, 'İsimsiz');
    v_action_url := '/(admin)/users?tab=pending';
  ELSIF NEW.user_type = 'lab' THEN
    v_title := 'Yeni lab personeli kaydı: ' || COALESCE(NEW.full_name, 'İsimsiz');
    v_action_url := '/(admin)/users?tab=pending';
  ELSE
    v_title := 'Yeni kullanıcı kaydı: ' || COALESCE(NEW.full_name, 'İsimsiz');
    v_action_url := '/(admin)/users';
  END IF;

  v_body := COALESCE(NEW.clinic_name, '') || CASE WHEN NEW.phone IS NOT NULL THEN ' · ' || NEW.phone ELSE '' END;
  v_payload := jsonb_build_object(
    'userId',         NEW.id,
    'userType',       NEW.user_type,
    'fullName',       NEW.full_name,
    'clinicName',     NEW.clinic_name,
    'phone',          NEW.phone,
    'approvalStatus', NEW.approval_status
  );

  -- Yalnız AYNI lab'ın aktif admin / lab manager'larına bildirim üret
  FOR v_admin IN
    SELECT id, lab_id FROM profiles
    WHERE is_active = TRUE
      AND lab_id = NEW.lab_id
      AND (
        user_type = 'admin'
        OR (user_type = 'lab' AND role = 'manager')
      )
  LOOP
    INSERT INTO notifications (
      user_id, lab_id, category, title, body,
      resource_type, resource_id, action_url, payload
    )
    VALUES (
      v_admin.id,
      v_admin.lab_id,
      'approval',
      v_title,
      NULLIF(v_body, ''),
      'profile',
      NEW.id,
      v_action_url,
      v_payload
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 3) Lab yöneticilerine bağlantı isteği bildirimi --------------------------------
-- Alıcılar can_manage_lab_settings() ile aynı küme: admin, lab yöneticisi, lab sahibi.
-- Bildirim hatası bağlanma isteğini ASLA düşürmez.
create or replace function public._signup_notify_lab_managers(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m       record;
  v_pid     uuid;
  v_ut      text;
  v_name    text;
  v_phone   text;
  v_email   text;
  v_pclinic uuid;
  v_clinic  text;
  v_signup  boolean;
  v_title   text;
  v_body    text;
  v_rec     record;
begin
  select m.id, m.lab_id, m.member_profile_id, m.member_clinic_id, m.lab_clinic_id
    into v_m
    from public.clinic_lab_memberships m
   where m.id = p_membership;
  if not found then
    return;
  end if;

  select c.name into v_clinic from public.clinics c where c.id = v_m.lab_clinic_id;

  if v_m.member_profile_id is not null then
    select p.id, p.user_type, p.full_name, p.phone, p.email, p.clinic_id
      into v_pid, v_ut, v_name, v_phone, v_email, v_pclinic
      from public.profiles p
     where p.id = v_m.member_profile_id;
  end if;

  -- Kliniği olmayan hesap = yeni kayıt (hesap onayı); diğerleri klinik bağlantısı.
  v_signup := v_pid is not null and v_pclinic is null;

  if v_signup then
    v_title := case v_ut
                 when 'doctor' then 'Yeni hekim kaydı: '
                 else 'Yeni klinik kaydı: '
               end || coalesce(nullif(btrim(v_name), ''), 'İsimsiz');
    v_body  := concat_ws(' · ', nullif(btrim(v_clinic), ''), nullif(btrim(v_phone), ''), nullif(btrim(v_email), ''));
  else
    v_title := 'Yeni bağlantı isteği: ' || coalesce(nullif(btrim(v_clinic), ''), 'Klinik');
    v_body  := null;
  end if;

  for v_rec in
    select p.id, p.user_type
      from public.profiles p
     where p.lab_id = v_m.lab_id
       and coalesce(p.is_active, true)
       and (
             p.user_type = 'admin'
          or (p.user_type = 'lab' and p.role in ('manager', 'admin'))
          or exists (select 1 from public.labs l where l.id = p.lab_id and l.owner_id = p.id)
       )
  loop
    insert into public.notifications (
      user_id, lab_id, category, title, body,
      resource_type, resource_id, action_url, payload
    ) values (
      v_rec.id,
      v_m.lab_id,
      'approval',
      v_title,
      nullif(v_body, ''),
      'clinic_lab_membership',
      v_m.id,
      case
        when v_signup and v_rec.user_type = 'admin' then '/(admin)/approvals?tab=doctors'
        when v_signup                               then '/(lab)/approvals?tab=doctors'
        when v_rec.user_type = 'admin'              then '/(admin)/clinic-connections'
        else                                             '/(lab)/clinic-connections'
      end,
      jsonb_build_object(
        'membershipId', v_m.id,
        'profileId',    v_pid,
        'userType',     v_ut,
        'fullName',     v_name,
        'clinicName',   v_clinic,
        'signup',       v_signup
      )
    );
  end loop;
end;
$$;

-- 4) Hesabı aç: aktif üyelikteki kliniksiz hesap --------------------------------
-- Üyelik aktif DEĞİLSE ya da hesap zaten bir kliniğe bağlıysa hesabı değiştirmez;
-- ikinci durumda yalnız üyeliğin member_clinic_id'sini kanonik kliniğe çeker
-- (çoklu-lab: _clinic_connect onaylı kullanıcı için aynısını yapar).
create or replace function public._activate_signup_member(p_membership uuid, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     record;
  v_p     record;
  v_perms jsonb;
  v_lab   text;
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

  begin
    select l.name into v_lab from public.labs l where l.id = v_m.lab_id;
    insert into public.notifications (
      user_id, lab_id, category, title, body,
      resource_type, resource_id, action_url, payload
    ) values (
      v_p.id, v_m.lab_id, 'approval', 'Hesabınız onaylandı', v_lab,
      'profile', v_p.id, '/',
      jsonb_build_object('membershipId', v_m.id, 'labName', v_lab)
    );
  exception when others then
    raise warning '_activate_signup_member(%): notify % %', v_p.id, sqlstate, sqlerrm;
  end;

  return v_p.id;
end;
$$;

-- 5) _clinic_connect: anında aktifse hesabı aç, bekliyorsa lab'a bildir ----------
-- Canlı tanım (pg_get_functiondef, 2026-10-17) + yalnız sondaki iki adım eklendi.
CREATE OR REPLACE FUNCTION public._clinic_connect(p_code text, p_expected_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ut  text := my_user_type();
  v_canonical uuid; v_name text; v_phone text; v_email text;
  v_code_id uuid; v_lab uuid; v_kind text; v_max int; v_uses int; v_exp timestamptz; v_active boolean;
  v_auto boolean; v_lab_clinic uuid; v_status text; v_member uuid;
BEGIN
  IF v_ut NOT IN ('doctor','clinic_admin','clinic_secretary') THEN RAISE EXCEPTION 'not a clinic user'; END IF;

  SELECT id, lab_id, kind, max_uses, uses, expires_at, active
    INTO v_code_id, v_lab, v_kind, v_max, v_uses, v_exp, v_active
    FROM lab_connect_codes WHERE upper(code) = upper(btrim(p_code));
  IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid code'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'code inactive'; END IF;
  IF v_kind <> p_expected_kind THEN RAISE EXCEPTION 'wrong code type'; END IF;
  IF v_exp IS NOT NULL AND v_exp < now() THEN RAISE EXCEPTION 'code expired'; END IF;
  IF v_max IS NOT NULL AND v_uses >= v_max THEN RAISE EXCEPTION 'code used up'; END IF;

  SELECT clinic_id, clinic_name, phone, email INTO v_canonical, v_name, v_phone, v_email
    FROM profiles WHERE id = v_uid;

  -- Zaten bağlıysa mevcut membership'i döndür (idempotent)
  SELECT id INTO v_member FROM clinic_lab_memberships
    WHERE lab_id = v_lab
      AND ((v_canonical IS NOT NULL AND member_clinic_id = v_canonical)
           OR (v_canonical IS NULL AND member_profile_id = v_uid))
    LIMIT 1;
  IF v_member IS NOT NULL THEN RETURN v_member; END IF;

  IF p_expected_kind = 'invite' THEN
    v_status := 'active';
  ELSE
    SELECT clinic_auto_approve INTO v_auto FROM labs WHERE id = v_lab;
    v_status := CASE WHEN COALESCE(v_auto, false) THEN 'active' ELSE 'pending' END;
  END IF;

  -- Lab'ın özel CRM clinics satırı (lab_id AÇIKÇA — klinik caller get_my_lab_id() NULL)
  INSERT INTO clinics (name, category, phone, email, lab_id, is_active)
  VALUES (COALESCE(NULLIF(btrim(v_name), ''), 'Klinik'), 'klinik', v_phone, v_email, v_lab, true)
  RETURNING id INTO v_lab_clinic;

  INSERT INTO clinic_lab_memberships
    (lab_id, member_clinic_id, member_profile_id, lab_clinic_id, status, initiated_by, approved_at)
  VALUES (v_lab, v_canonical,
          CASE WHEN v_canonical IS NULL THEN v_uid ELSE NULL END,
          v_lab_clinic, v_status,
          CASE WHEN p_expected_kind = 'invite' THEN 'lab' ELSE 'clinic' END,
          CASE WHEN v_status = 'active' THEN now() ELSE NULL END)
  RETURNING id INTO v_member;

  UPDATE lab_connect_codes SET uses = uses + 1 WHERE id = v_code_id;

  -- Kayıt akışı: davet kodu / otomatik onay → kliniksiz hesap şimdi açılır.
  IF v_status = 'active' THEN
    PERFORM public._activate_signup_member(v_member, NULL);
  ELSE
    BEGIN
      PERFORM public._signup_notify_lab_managers(v_member);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_clinic_connect(%): notify % %', v_member, SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN v_member;
END; $function$;

-- 5b) _guard_clinic_user_update: yalnız doğrudan istemci isteği ---------------------
-- DEFINER olduğu için current_user hep postgres'ti; çağıran klinik yöneticisi olunca
-- sunucu yollarını da (davet koduyla kendi hesabını açan klinik yöneticisi) engelliyordu.
-- profiles_guard_privileged_columns ile aynı desen: INVOKER + current_user ayrımı.
-- İstemci için kural aynen geçerli (ayrıca o guard clinic_id/lab_id/id'yi zaten kilitler).
CREATE OR REPLACE FUNCTION public._guard_clinic_user_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- DEFINER RPC'ler, service_role ve postgres baypas eder.
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  -- Sadece clinic_admin çağrısı kontrol edilir (admin/lab serbest)
  IF NOT is_clinic_admin() THEN RETURN NEW; END IF;

  IF NEW.id <> OLD.id
     OR COALESCE(NEW.clinic_id::text,'') <> COALESCE(OLD.clinic_id::text,'')
     OR COALESCE(NEW.lab_id::text,'')    <> COALESCE(OLD.lab_id::text,'') THEN
    RAISE EXCEPTION 'clinic_admin id/clinic_id/lab_id değiştiremez';
  END IF;

  RETURN NEW;
END;
$function$;

-- 6) Onay / red: yalnız lab yöneticisi; onay hesabı da açar ----------------------
CREATE OR REPLACE FUNCTION public.lab_approve_clinic(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_manage_lab_settings() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE clinic_lab_memberships
    SET status = 'active', approved_at = now(), approved_by = auth.uid()
    WHERE id = p_membership_id AND lab_id = get_my_lab_id() AND status = 'pending';
  IF NOT FOUND THEN
    -- Üyelik zaten aktif ama hesap hâlâ kliniksiz (ör. üyelik doğrudan güncellendi):
    -- onay yalnız hesabı açar.
    IF NOT EXISTS (
      SELECT 1
        FROM clinic_lab_memberships m
        JOIN profiles p ON p.id = m.member_profile_id
       WHERE m.id = p_membership_id
         AND m.lab_id = get_my_lab_id()
         AND m.status = 'active'
         AND p.clinic_id IS NULL
    ) THEN
      RAISE EXCEPTION 'not found / not your lab / not pending';
    END IF;
  END IF;
  PERFORM public._activate_signup_member(p_membership_id, auth.uid());
END; $function$;

CREATE OR REPLACE FUNCTION public.lab_reject_clinic(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_manage_lab_settings() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE clinic_lab_memberships
    SET status = 'rejected', approved_by = auth.uid()
    WHERE id = p_membership_id AND lab_id = get_my_lab_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not found / not your lab'; END IF;
END; $function$;

-- 7) Kayıt sonrası bağlanma (istemci, e-posta OTP'den sonra) ---------------------
-- Kodu önce davet, olmazsa public katılım kodu olarak dener (ConnectLabScreen ile aynı).
-- Hesap henüz kliniksizse lab'ın CRM kliniğini kayıt bilgileriyle tamamlar
-- (adres / klinik tipi auth metadata'dan: yalnız tanımlayıcı alanlar, boşsa doldurulur).
create or replace function public.clinic_signup_connect(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_p      record;
  v_member uuid;
  v_m      record;
  v_meta   jsonb;
  v_addr   text;
  v_type   text;
begin
  select p.id, p.user_type, p.clinic_id, p.full_name
    into v_p
    from public.profiles p
   where p.id = v_uid;
  if not found or v_p.user_type not in ('doctor', 'clinic_admin', 'clinic_secretary') then
    raise exception 'not a clinic user' using errcode = '42501';
  end if;

  begin
    v_member := public._clinic_connect(p_code, 'invite');
  exception when others then
    if sqlerrm ~* 'wrong code type' then
      v_member := public._clinic_connect(p_code, 'public_join');
    else
      raise;
    end if;
  end;

  select m.id, m.lab_id, m.status, m.member_profile_id, m.lab_clinic_id
    into v_m
    from public.clinic_lab_memberships m
   where m.id = v_member;

  if v_m.status in ('rejected', 'revoked') then
    raise exception 'request rejected' using errcode = 'P0001';
  end if;

  if v_m.member_profile_id = v_uid and v_m.lab_clinic_id is not null
     and v_m.lab_clinic_id is distinct from v_p.clinic_id then
    select u.raw_user_meta_data into v_meta from auth.users u where u.id = v_uid;
    v_addr := left(nullif(btrim(v_meta ->> 'address'), ''), 500);
    v_type := v_meta ->> 'clinic_type';
    if v_type is null or v_type not in ('klinik', 'poliklinik', 'hastane') then
      v_type := null;
    end if;
    update public.clinics c
       set address        = coalesce(c.address, v_addr),
           contact_person = coalesce(c.contact_person, nullif(btrim(v_p.full_name), '')),
           clinic_type    = coalesce(v_type, c.clinic_type)
     where c.id = v_m.lab_clinic_id;
  end if;

  return jsonb_build_object(
    'membership_id', v_m.id,
    'status',        v_m.status,
    'lab_name',      (select l.name from public.labs l where l.id = v_m.lab_id),
    'approved',      coalesce((select p.approval_status = 'approved' and p.clinic_id is not null
                                 from public.profiles p where p.id = v_uid), false)
  );
end;
$$;

-- 8) Lab: hesap onayı bekleyen kayıtlar (ve son kararlar) ------------------------
-- Yalnız yöneticiye ve yalnız kendi lab'ının üyeliklerine; aksi halde boş döner
-- (sekme sayacı her lab kullanıcısında yoklanıyor, hata gürültüsü olmasın).
create or replace function public.lab_signup_requests(p_history boolean default false)
returns table (
  membership_id   uuid,
  status          text,
  requested_at    timestamptz,
  decided_at      timestamptz,
  profile_id      uuid,
  full_name       text,
  email           text,
  phone           text,
  user_type       text,
  clinic_name     text,
  address         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.status,
         m.requested_at,
         case when m.status = 'active' then m.approved_at else m.updated_at end,
         p.id,
         p.full_name,
         p.email,
         p.phone,
         p.user_type,
         coalesce(c.name, p.clinic_name),
         c.address
    from public.clinic_lab_memberships m
    join public.profiles p on p.id = m.member_profile_id
    left join public.clinics c on c.id = m.lab_clinic_id
   where public.can_manage_lab_settings()
     and m.lab_id = public.get_my_lab_id()
     and p.user_type in ('doctor', 'clinic_admin', 'clinic_secretary')
     and case
           when p_history then
             m.status = 'rejected'
             or (m.status = 'active' and p.clinic_id is not null)
           else
             m.status = 'pending'
             or (m.status = 'active' and p.clinic_id is null)
         end
   order by case when p_history then coalesce(m.approved_at, m.updated_at) else m.requested_at end desc
   limit case when p_history then 30 else 200 end;
$$;

-- 9) Lab: reddedilen kaydı yeniden incelemeye al ---------------------------------
create or replace function public.lab_reopen_signup(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_lab_settings() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.clinic_lab_memberships m
     set status = 'pending', approved_at = null, approved_by = null
   where m.id = p_membership_id
     and m.lab_id = public.get_my_lab_id()
     and m.status = 'rejected'
     and m.member_profile_id is not null;
  if not found then
    raise exception 'not found / not your lab / not rejected';
  end if;
end;
$$;

-- 10) Yetkiler ---------------------------------------------------------------------
revoke all on function public._signup_notify_lab_managers(uuid)    from public, anon, authenticated;
revoke all on function public._activate_signup_member(uuid, uuid)  from public, anon, authenticated;
grant execute on function public._signup_notify_lab_managers(uuid)   to service_role;
grant execute on function public._activate_signup_member(uuid, uuid) to service_role;

revoke all on function public.clinic_signup_connect(text)     from public, anon;
revoke all on function public.lab_signup_requests(boolean)    from public, anon;
revoke all on function public.lab_reopen_signup(uuid)         from public, anon;
grant execute on function public.clinic_signup_connect(text)  to authenticated, service_role;
grant execute on function public.lab_signup_requests(boolean) to authenticated, service_role;
grant execute on function public.lab_reopen_signup(uuid)      to authenticated, service_role;

-- 11) approvals: all_approvals hekimi kapsamaz ------------------------------------
-- Eskiden her 'doctor' profili (lab_id NULL → tenant_guard serbest) TÜM lab'ların
-- approvals satırlarını okuyup yazabiliyordu; public kayıt bunu herkese açardı.
-- Hekim kendi satırlarını doctor_read_own_approvals ile okumaya devam eder;
-- istemcide hekim approvals'a yazmaz (üretim adımları / onay ekranları lab tarafı).
alter policy all_approvals on public.approvals
  using (exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.user_type = any (array['lab'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.user_type = any (array['lab'::text, 'admin'::text])
  ));

-- 12) Tetikleyici yokken açılmış profilsiz klinik-tarafı kayıtlar -------------------
-- handle_new_user ile aynı güvenli varsayılanlar (metadata kiracı/onay belirleyemez).
insert into public.profiles (
  id, user_type, full_name, clinic_name, clinic_id,
  role, phone, is_active, approval_status, lab_id, email
)
select u.id,
       case when u.raw_user_meta_data ->> 'user_type' in ('doctor', 'clinic_admin', 'clinic_secretary')
            then u.raw_user_meta_data ->> 'user_type' else 'doctor' end,
       coalesce(u.raw_user_meta_data ->> 'full_name', ''),
       u.raw_user_meta_data ->> 'clinic_name',
       null,
       null,
       u.raw_user_meta_data ->> 'phone',
       false,
       'pending',
       null,
       u.email
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
   and (u.raw_user_meta_data ->> 'user_type') is distinct from 'lab'
on conflict (id) do nothing;
