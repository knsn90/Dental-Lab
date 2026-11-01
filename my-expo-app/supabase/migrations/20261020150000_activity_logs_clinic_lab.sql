-- Aktivite kayıtlarında lab boş kalıyordu — 2026-10-20
--
-- SORUN: klinik/hekim kullanıcılarının profilinde lab_id YOK. log_activity lab'ı
-- aktörün profilinden alıyor (çağıranın verdiği lab güvenlik için yok sayılıyor),
-- tetikleyici yazıcıları (log_work_order_created …) da çoğunlukla aynı kaynağı
-- kullanıyor → klinik işlemleri lab_id = NULL ile yazılıyor ve lab'ın Kayıtlar
-- ekranı (lab_id = get_my_lab_id()) bunları göstermiyordu. Örn. 2026-10-20 Luna
-- Klinik NEX-2026-0199 oluşturma + 2 dosya + mesaj. Temmuz'dan beri 94 satır.
--
-- ÇÖZÜM: lab tek noktada, tablonun BEFORE INSERT adımında çözülür (log_activity
-- ve 11 tetikleyici yazıcıya dokunmadan):
--   1) aktörün kendi lab'ı;
--   2) klinik/hekimse: kaydın ilgili olduğu siparişin / kliniğin / hekimin lab'ı —
--      YALNIZ aktör o lab'la gerçekten çalışıyorsa (CRM kliniği veya aktif üyelik);
--   3) aktör tek bir lab'la çalışıyorsa o lab; aksi halde boş (tahmin yok).
-- Hata olursa kayıt eskisi gibi boş lab'la yazılır — asıl işlemi (sipariş vb.) ASLA
-- durdurmaz.
--
-- GÜVENLİK: activity_logs'a istemciden DOĞRUDAN yazım (authenticated INSERT
-- politikası) lab_id'yi serbest bırakıyordu → oturum açan biri başka lab'ın
-- kayıt ekranına sahte satır düşebilirdi. Doğrudan yazımda lab artık daima
-- sunucuda hesaplanır (istemcinin verdiği değer yok sayılır). Uygulama bu tabloya
-- yalnız OKUR; yazım log_activity RPC'si ve tetikleyicilerle.

-- ── 1) aktör → lab çözümü (yalnız sunucu içi) ────────────────────────────
create or replace function public._actor_lab_for_log(p_actor uuid, p_entity_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plab   uuid;
  v_clinic uuid;
  v_labs   uuid[];
  v_ent    uuid;
begin
  if p_actor is null then
    return null;
  end if;

  select p.lab_id, p.clinic_id into v_plab, v_clinic
    from public.profiles p where p.id = p_actor;
  if v_plab is not null then
    return v_plab;
  end if;

  -- Aktörün çalıştığı lab'lar: CRM kliniğinin lab'ı + aktif üyelikler.
  select array_agg(distinct s.l) into v_labs
    from (
      select c.lab_id as l
        from public.clinics c
       where c.id = v_clinic and c.lab_id is not null
      union
      select m.lab_id
        from public.clinic_lab_memberships m
       where m.status = 'active'
         and ((v_clinic is not null and m.member_clinic_id = v_clinic)
              or m.member_profile_id = p_actor)
    ) s;
  if v_labs is null or cardinality(v_labs) = 0 then
    return null;
  end if;

  if p_entity_id is not null then
    v_ent := coalesce(
      (select w.lab_id from public.work_orders w where w.id = p_entity_id),
      (select c.lab_id from public.clinics c where c.id = p_entity_id),
      (select c.lab_id from public.doctors d join public.clinics c on c.id = d.clinic_id
        where d.id = p_entity_id));
    if v_ent is not null then
      -- Kayıt bir lab'a ait varlıkla ilgili: o lab aktörün lab'ıysa onu kullan,
      -- değilse tahmin etme.
      return case when v_ent = any (v_labs) then v_ent else null end;
    end if;
  end if;

  return case when cardinality(v_labs) = 1 then v_labs[1] else null end;
end;
$$;

revoke all on function public._actor_lab_for_log(uuid, uuid) from public, anon, authenticated;
grant execute on function public._actor_lab_for_log(uuid, uuid) to service_role;

-- İstemci bağlamı için dar sürüm: yalnız ÇAĞIRANIN kendi lab'ı (başkasınınkini sorgulatmaz).
create or replace function public._my_log_lab(p_entity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public._actor_lab_for_log(auth.uid(), p_entity_id)
$$;

revoke all on function public._my_log_lab(uuid) from public, anon;
grant execute on function public._my_log_lab(uuid) to authenticated;

-- ── 2) tablonun lab adımı ────────────────────────────────────────────────
-- SECURITY INVOKER (bilinçli): current_user ile doğrudan istemci yazımını
-- (authenticated/anon) DEFINER yazıcılardan (postgres) ayırır — labs_guard deseni.
create or replace function public.activity_logs_resolve_lab()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- Doğrudan istemci yazımı: lab'ı istemci SEÇEMEZ.
    new.lab_id := null;
    begin
      new.lab_id := coalesce(public.get_my_lab_id(), public._my_log_lab(new.entity_id));
    exception when others then
      new.lab_id := null;
    end;
  elsif new.lab_id is null then
    begin
      new.lab_id := coalesce(public.get_my_lab_id(), public._actor_lab_for_log(new.actor_id, new.entity_id));
    exception when others then
      raise warning 'activity_logs_resolve_lab: % %', sqlstate, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- Eski adım paylaşılan auto_set_lab_id'yi çağırıyordu (yalnız get_my_lab_id);
-- yeni adım onu da kapsar. auto_set_lab_id fonksiyonu diğer tablolarda kullanılıyor — dokunulmadı.
drop trigger if exists activity_logs_auto_lab_id on public.activity_logs;
drop trigger if exists activity_logs_resolve_lab on public.activity_logs;
create trigger activity_logs_resolve_lab
  before insert on public.activity_logs
  for each row execute function public.activity_logs_resolve_lab();

-- ── 3) geçmiş boş-lab kayıtları ──────────────────────────────────────────
update public.activity_logs a
   set lab_id = public._actor_lab_for_log(a.actor_id, a.entity_id)
 where a.lab_id is null
   and public._actor_lab_for_log(a.actor_id, a.entity_id) is not null;
