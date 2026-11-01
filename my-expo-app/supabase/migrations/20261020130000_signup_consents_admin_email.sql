-- Kayıt onayları + yeni kayıt e-postası — 2026-10-20
--
-- 1) KVKK onayları kayıtta yazılamıyordu: e-posta OTP'si girilene kadar oturum
--    yok, record_consents oturum istiyor → istemci çağrısı sessizce düşüyor,
--    ConsentGuard OTP'den sonra aynı onayları ikinci kez soruyordu (kanıt:
--    2026-10-20 15:28 kaydında ilk onay hesaptan 72 sn SONRA, guard'dan yazıldı).
--    Çözüm: istemci onayları signUp metadata'sında (`consents`) gönderir; bu
--    tetikleyici hesap oluşurken user_consents'e yazar. handle_new_user'a
--    DOKUNULMADI. Tetikleyici hata verirse kaydı DURDURMAZ (uyarı + geç);
--    ConsentGuard yedek olarak kalır.
--    Güven: metadata kullanıcının kendi beyanı — record_consents'i kendisi
--    çağırmasıyla aynı güven düzeyi. Yalnız bilinen türler + boolean değer.
--
-- 2) _signup_notify_lab_managers: yeni KAYITTA (bağlantı isteğinde değil) aynı
--    yönetici/admin listesine e-posta da gider (uygulama içi zaten vardı).
--    Link /(lab)/approvals → e-postada /approvals; guard kullanıcıyı kendi
--    panelinin aynı sayfasına taşır (admin → /(admin)/approvals).

-- ── 1) kayıt onayları ───────────────────────────────────────────────────
create or replace function public._record_signup_consents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       jsonb := new.raw_user_meta_data -> 'consents';
  v_items   jsonb;
  v_ver     text;
  v_ua      text;
  v_kind    text;
  v_val     jsonb;
  v_privacy boolean := false;
  v_terms   boolean := false;
begin
  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    return new;
  end if;
  v_items := v_c -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'object' then
    return new;
  end if;
  v_ver := left(nullif(btrim(v_c ->> 'version'), ''), 40);
  v_ua  := left(v_c ->> 'ua', 400);

  begin
    for v_kind, v_val in select e.key, e.value from jsonb_each(v_items) e loop
      if v_kind not in ('privacy_policy', 'terms', 'ai_processing', 'marketing_whatsapp',
                        'marketing_sms', 'international_transfer')
         or jsonb_typeof(v_val) <> 'boolean' then
        continue;
      end if;
      insert into public.user_consents (user_id, kind, granted, document_version, user_agent)
      values (new.id, v_kind, (v_val #>> '{}')::boolean, v_ver, v_ua);
      if v_kind = 'privacy_policy' and (v_val #>> '{}')::boolean then v_privacy := true; end if;
      if v_kind = 'terms'          and (v_val #>> '{}')::boolean then v_terms   := true; end if;
    end loop;

    -- Profil handle_new_user'da (alfabetik olarak önce çalışan tetikleyici) açıldı;
    -- lab kaydında profil henüz yoksa bu güncelleme no-op'tur.
    if v_privacy and v_terms then
      update public.profiles
         set kvkk_accepted_at = coalesce(kvkk_accepted_at, now())
       where id = new.id;
    end if;
  exception when others then
    raise warning '_record_signup_consents(%): % %', new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public._record_signup_consents() from public, anon, authenticated;

-- Ad alfabetik olarak on_auth_user_created'dan SONRA → profil var.
drop trigger if exists on_auth_user_created_zconsents on auth.users;
create trigger on_auth_user_created_zconsents
  after insert on auth.users
  for each row execute function public._record_signup_consents();

-- ── 2) yeni kayıt → yöneticilere e-posta (canlı tanım + e-posta bloğu) ────
CREATE OR REPLACE FUNCTION public._signup_notify_lab_managers(p_membership uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_to      jsonb := '[]'::jsonb;
  v_lab     text;
  v_logo    text;
  v_anon    text;
  v_secret  text;
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
    v_to := v_to || to_jsonb(v_rec.id::text);
  end loop;

  -- Yeni kayıt → aynı kişilere e-posta (tercihleri geçerli: 'approval' e-postası).
  if v_signup and jsonb_array_length(v_to) > 0 then
    begin
      select l.name, l.logo_url into v_lab, v_logo from public.labs l where l.id = v_m.lab_id;
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
            'userIds',  v_to,
            'category', 'approval',
            'payload',  jsonb_build_object(
              'title',     v_title,
              'body',      'Yeni kayıt laboratuvar onayınızı bekliyor. Onaylayana kadar hesap açılmaz.',
              'actionUrl', '/(lab)/approvals?tab=doctors',
              'extra',     jsonb_strip_nulls(jsonb_build_object(
                'signupType', case v_ut when 'doctor' then 'Hekim (muayenehane)' else 'Klinik' end,
                'fullName',   nullif(btrim(v_name), ''),
                'clinicName', nullif(btrim(v_clinic), ''),
                'phone',      nullif(btrim(v_phone), ''),
                'email',      nullif(btrim(v_email), ''),
                'labName',    v_lab,
                'labLogoUrl', v_logo,
                'ctaLabel',   'Kaydı İncele')))));
      end if;
    exception when others then
      raise warning '_signup_notify_lab_managers(%): email % %', p_membership, sqlstate, sqlerrm;
    end;
  end if;
end;
$function$;
