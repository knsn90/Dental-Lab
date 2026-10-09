-- Telefon talebi bildirim başlığı: talep + arayan (e-posta konusu bu başlıktan gelir).
-- Gövde: özet + telefon + geri arama. Konuşma dökümü e-postada ayrıca gösterilir
-- (send-email-notification, yalnız phone_lead).

create or replace function public.record_phone_lead(p_lab_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id      uuid;
  v_name    text := nullif(btrim(p_payload->>'contact_name'), '');
  v_phone   text := coalesce(nullif(btrim(p_payload->>'contact_phone'), ''), nullif(btrim(p_payload->>'caller_number'), ''));
  v_request text := nullif(btrim(p_payload->>'request'), '');
  v_summary text := nullif(btrim(p_payload->>'summary'), '');
  v_cb      boolean := coalesce((p_payload->>'wants_callback')::boolean, false);
  v_title   text;
  v_body    text;
  v_uid     uuid;
begin
  if p_lab_id is null or not exists (select 1 from public.labs where id = p_lab_id) then
    raise exception 'record_phone_lead: gecersiz lab';
  end if;
  if coalesce(p_payload->>'call_id', '') = '' then
    raise exception 'record_phone_lead: call_id zorunlu';
  end if;

  insert into public.phone_leads (
    lab_id, call_id, caller_number, contact_name, contact_phone, request, summary,
    wants_callback, language, transcript, duration_sec
  ) values (
    p_lab_id,
    left(p_payload->>'call_id', 64),
    left(nullif(btrim(p_payload->>'caller_number'), ''), 32),
    left(v_name, 120),
    left(nullif(btrim(p_payload->>'contact_phone'), ''), 32),
    left(v_request, 1000),
    left(v_summary, 2000),
    v_cb,
    left(nullif(btrim(p_payload->>'language'), ''), 8),
    coalesce(p_payload->'transcript', '[]'::jsonb),
    nullif(p_payload->>'duration_sec', '')::integer
  )
  on conflict (call_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.phone_leads where call_id = p_payload->>'call_id';
    return v_id;
  end if;

  -- Konu satırı: talep + kim. Örn. "Telefon talebi: Zirkon kron fiyatı bilgisi – Kaan Esen"
  v_title := 'Telefon talebi: ' || coalesce(left(v_request, 80), 'Görüşme kaydı')
             || ' – ' || coalesce(v_name, v_phone, 'Bilinmeyen arayan');
  v_body  := concat_ws(E'\n',
    coalesce(v_summary, v_request, 'Görüşme kaydı'),
    case when v_phone is not null then 'Telefon: ' || v_phone end,
    case when v_cb then 'Geri arama istiyor' end);

  for v_uid in
    select p.id from public.profiles p
     where p.lab_id = p_lab_id
       and coalesce(p.is_active, true)
       and (p.user_type = 'admin' or (p.user_type = 'lab' and p.role = 'manager'))
       and coalesce((p.notification_prefs->'categories'->'phone_lead'->>'in_app')::boolean, true)
  loop
    perform public._notify_channels(
      v_uid, 'phone_lead', v_title, v_body, 'phone_lead', v_id, null,
      jsonb_build_object('lead_id', v_id, 'wants_callback', v_cb, 'phone', v_phone));
  end loop;

  return v_id;
end;
$function$;

revoke all on function public.record_phone_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_phone_lead(uuid, jsonb) to service_role;
