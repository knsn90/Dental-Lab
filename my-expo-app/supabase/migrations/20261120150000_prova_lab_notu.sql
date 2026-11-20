-- Prova fişi: lab'ın fişe yazdığı not provanın lab_notes alanına kaydedilir.
-- prova_set_note (hekim notu) ile aynı yetki kuralı: _prova_can_manage.
CREATE OR REPLACE FUNCTION public.prova_set_lab_note(p_prova uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public._prova_can_manage((select work_order_id from public.provas where id = p_prova)) then
    raise exception 'Bu provayı yönetme yetkiniz yok' using errcode = '42501';
  end if;
  update public.provas set lab_notes = nullif(btrim(coalesce(p_note, '')), '') where id = p_prova;
end;
$function$;

REVOKE ALL ON FUNCTION public.prova_set_lab_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prova_set_lab_note(uuid, text) TO authenticated, service_role;
