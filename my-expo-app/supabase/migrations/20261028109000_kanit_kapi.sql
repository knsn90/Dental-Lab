-- 2. dalga 5 — Kanıt kapısı (20261028109000_kanit_kapi)
-- UYGULAMA ŞARTI (spec 7.5): web yayını yapılmış + kuryelerin kullandığı uygulama/sürüm kontrol edilmiş + kullanıcı onayı.
-- 1) koruma genişler: istemci recipient_name / signature_path'i de doğrudan yazamaz
-- 2) kapı: kendi kurye teslimatı fotoğrafsız (kliniğe: ad+imza ya da neden olmadan) teslim_edildi olamaz

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
       or NEW.recipient_name is not null or NEW.signature_path is not null
       or NEW.proof_source is not null or NEW.proof_captured_at is not null
       or NEW.recipient_title is not null or NEW.proof_override_reason is not null
       or NEW.proof_override_by is not null or NEW.proof_override_by_name is not null
       or NEW.proof_override_at is not null or NEW.provider_proof_checked_at is not null then
      raise exception 'Teslim kanıtı yalnız teslim akışıyla yazılır' using errcode = '42501';
    end if;
    return NEW;
  end if;
  if NEW.proof_photo_path is distinct from OLD.proof_photo_path
     or NEW.recipient_name is distinct from OLD.recipient_name
     or NEW.signature_path is distinct from OLD.signature_path
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

-- Kanıt kapısı: kendi kurye teslimatı kanıtsız teslim_edildi'ye geçemez (her yoldan: RPC, doğrudan
-- güncelleme, eski istemci). Yerine geçen tek şey yöneticinin gerekçeli kanıtsız kapatması.
create or replace function public._deliveries_proof_gate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if NEW.status::text = 'teslim_edildi' and OLD.status::text is distinct from 'teslim_edildi'
     and NEW.mode = 'internal' and NEW.proof_override_reason is null then
    if NEW.proof_photo_path is null then
      raise exception 'Teslim için fotoğraf gerekli' using errcode = 'P0001';
    end if;
    if coalesce(NEW.direction, 'lab_to_clinic') = 'lab_to_clinic'
       and not ((nullif(btrim(NEW.recipient_name), '') is not null and NEW.signature_path is not null)
                or nullif(btrim(NEW.signature_skipped_reason), '') is not null) then
      raise exception 'Teslim için teslim alanın adı ve imzası gerekli' using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$function$;

revoke all on function public._deliveries_proof_gate() from public, anon, authenticated;

create trigger trg_deliveries_proof_gate
  before update of status on public.deliveries
  for each row execute function public._deliveries_proof_gate();
