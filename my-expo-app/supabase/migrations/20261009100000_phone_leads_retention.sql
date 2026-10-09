-- KVKK saklama (kullanıcı kararı 2026-10-09): telefon talepleri 90 gün sonra ANONİMLEŞTİRİLİR.
-- Silinen: konuşma dökümü, arayan numarası, ad, telefon, özet, personel notu.
-- Kalan: talep konusu (request), tarih, durum — istatistik için.
-- Aynı kişisel veri bildirim (title/body/payload) ve e-posta kaydı (subject/payload) içinde de
-- kopyalandığı için onlar da talep konusuna indirgenir.
-- Not: alıcıların e-posta kutularına gitmiş e-postalar bu işin kapsamı dışındadır.

alter table public.phone_leads add column if not exists anonymized_at timestamptz;

create or replace function public.anonymize_old_phone_leads(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
  v_n   integer;
begin
  if p_days is null or p_days < 7 then
    raise exception 'anonymize_old_phone_leads: p_days en az 7 olmali';
  end if;

  with x as (
    update public.phone_leads
       set transcript = '[]'::jsonb, caller_number = null, contact_name = null,
           contact_phone = null, summary = null, note = null, anonymized_at = now()
     where anonymized_at is null
       and created_at < now() - make_interval(days => p_days)
    returning id
  )
  select array_agg(id) into v_ids from x;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return 0; end if;

  update public.notifications n
     set title   = 'Telefon talebi: ' || coalesce(left(l.request, 80), 'Görüşme kaydı'),
         body    = coalesce(l.request, 'Görüşme kaydı'),
         payload = jsonb_build_object('lead_id', l.id)
    from public.phone_leads l
   where n.resource_type = 'phone_lead' and n.resource_id = l.id and l.id = any(v_ids);

  update public.email_notifications e
     set subject = n.title,
         payload = jsonb_build_object('title', n.title)
    from public.notifications n
   where e.notification_id = n.id and n.resource_type = 'phone_lead' and n.resource_id = any(v_ids);

  return v_n;
end;
$function$;

revoke all on function public.anonymize_old_phone_leads(integer) from public, anon, authenticated;

-- Her gece 03:30 (İstanbul = 00:30 UTC)
select cron.unschedule('phone-leads-anonymize') where exists (select 1 from cron.job where jobname = 'phone-leads-anonymize');
select cron.schedule('phone-leads-anonymize', '30 0 * * *', $$select public.anonymize_old_phone_leads(90)$$);
