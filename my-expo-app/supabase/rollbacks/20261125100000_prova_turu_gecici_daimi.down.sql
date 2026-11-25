-- Geri alma: tür parametresiz prova_mark_sent'e dön, prova_set_kind'ı ve sütunu kaldır.
-- order_prova_snapshot'taki 'kind' anahtarı sütun düşünce hata verir → önce 20261027162000 sürümünü yeniden uygulayın.
drop function if exists public.prova_set_kind(uuid, text);
drop function if exists public.prova_mark_sent(uuid, date, text);
create or replace function public.prova_mark_sent(p_prova uuid, p_day date default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  perform public._prova_apply(p_prova, 'sent', p_day, null, 'manual');
end;
$function$;
grant execute on function public.prova_mark_sent(uuid, date) to authenticated, service_role;
alter table public.provas drop column if exists prova_kind;
