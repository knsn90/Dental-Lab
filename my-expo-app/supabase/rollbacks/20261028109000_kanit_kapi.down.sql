-- Geri alma: 20261028109000_kanit_kapi
drop trigger if exists trg_deliveries_proof_gate on public.deliveries;
drop function if exists public._deliveries_proof_gate();

-- koruma 20261028100000 hâline döner
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
