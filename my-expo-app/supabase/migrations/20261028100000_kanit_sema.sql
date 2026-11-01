-- 2. dalga 5 — Kurye teslim kanıtı: şema, dosya alanı, koruma (20261028100000)
-- 1) deliveries'e kanıt sütunları (hepsi boş başlar; geriye dönük doldurma yok)
-- 2) delivery-proofs dosya alanı (herkese kapalı) + yükleme/okuma politikaları
-- 3) koruma: istemci yeni kanıt sütunlarını doğrudan yazamaz (yalnız DEFINER RPC'ler).
--    recipient_name / signature_path bu aşamada korunmaz: eski istemci yazmaya devam eder
--    (kanıt kapısı migration'ı 20261028109000 ekler).

alter table public.deliveries
  add column if not exists proof_photo_path          text,
  add column if not exists signature_skipped_reason  text,
  add column if not exists proof_source              text,
  add column if not exists proof_captured_at         timestamptz,
  add column if not exists recipient_title           text,
  add column if not exists proof_override_reason     text,
  add column if not exists proof_override_by         uuid,
  add column if not exists proof_override_by_name    text,
  add column if not exists proof_override_at         timestamptz,
  add column if not exists provider_proof_checked_at timestamptz;

alter table public.deliveries
  add constraint deliveries_proof_source_check
    check (proof_source is null or proof_source in ('courier', 'provider', 'manager_override')),
  add constraint deliveries_proof_override_by_fkey
    foreign key (proof_override_by) references public.profiles(id) on delete set null;

-- ── dosya alanı ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Yükleme: yalnız o teslimatın kuryesi, kendi kurye teslimatında, teslim kapanmadan önce,
-- yol <lab_id>/<delivery_id>/… olmalı.
create or replace function public._delivery_proof_can_upload(p_lab uuid, p_delivery uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.deliveries d
     where d.id = p_delivery
       and d.lab_id = p_lab
       and d.courier_id = auth.uid()
       and d.mode = 'internal'
       and d.status::text not in ('teslim_edildi', 'iptal')
  );
$function$;

-- Okuma: teslimat satırını okuyabilen herkes. INVOKER → deliveries RLS'i aynen uygulanır.
create or replace function public._delivery_visible(p_delivery uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $function$
  select exists (select 1 from public.deliveries where id = p_delivery);
$function$;

revoke all on function public._delivery_proof_can_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public._delivery_visible(uuid) from public, anon, authenticated;
grant execute on function public._delivery_proof_can_upload(uuid, uuid) to authenticated;
grant execute on function public._delivery_visible(uuid) to authenticated;

create policy dp_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and public._delivery_proof_can_upload(public.try_uuid(split_part(name, '/', 1)),
                                          public.try_uuid(split_part(name, '/', 2)))
  );

create policy dp_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and public._delivery_visible(public.try_uuid(split_part(name, '/', 2)))
  );

-- ── koruma ──────────────────────────────────────────────────────────────
-- INVOKER: DEFINER RPC içinde current_user = fonksiyon sahibi (postgres) → geçer;
-- istemcinin doğrudan yazımında current_user = authenticated/anon → reddedilir.
create or replace function public._deliveries_proof_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    if NEW.proof_photo_path is not null or NEW.signature_skipped_reason is not null
       or NEW.proof_source is not null or NEW.proof_captured_at is not null
       or NEW.recipient_title is not null or NEW.proof_override_reason is not null
       or NEW.proof_override_by is not null or NEW.proof_override_by_name is not null
       or NEW.proof_override_at is not null or NEW.provider_proof_checked_at is not null then
      raise exception 'Teslim kanıtı yalnız teslim akışıyla yazılır' using errcode = '42501';
    end if;
    return NEW;
  end if;
  if NEW.proof_photo_path is distinct from OLD.proof_photo_path
     or NEW.signature_skipped_reason is distinct from OLD.signature_skipped_reason
     or NEW.proof_source is distinct from OLD.proof_source
     or NEW.proof_captured_at is distinct from OLD.proof_captured_at
     or NEW.recipient_title is distinct from OLD.recipient_title
     or NEW.proof_override_reason is distinct from OLD.proof_override_reason
     or NEW.proof_override_by is distinct from OLD.proof_override_by
     or NEW.proof_override_by_name is distinct from OLD.proof_override_by_name
     or NEW.proof_override_at is distinct from OLD.proof_override_at
     or NEW.provider_proof_checked_at is distinct from OLD.provider_proof_checked_at then
    raise exception 'Teslim kanıtı yalnız teslim akışıyla yazılır' using errcode = '42501';
  end if;
  return NEW;
end;
$function$;

revoke all on function public._deliveries_proof_guard() from public, anon, authenticated;

create trigger trg_deliveries_proof_guard
  before insert or update on public.deliveries
  for each row execute function public._deliveries_proof_guard();
