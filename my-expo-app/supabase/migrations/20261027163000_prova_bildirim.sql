-- 2. dalga 4 — Prova günlük taraması, sabah özeti istisnası, Geçmiş eklemeleri
-- (spec 2026-10-27-prova-takibi-design.md §4.5, §4.7, §5.6, §5.7)
--
-- * _prova_watch_collect: gönderim yapmadan "kime ne gidecek" listesi (denemeler bunu ölçer).
-- * fn_prova_watch (cron 'prova-watch' her gün 08:10 UTC):
--     - dönmesi geciken prova: lab yöneticilerine uygulama içi; hekim + klinik yöneticisi/sekreterine
--       uygulama içi + yalnız e-posta (WhatsApp/push yok). Prova başına BİR KEZ (late_notified_at).
--     - takma randevusu riski (yaklaşıyor / yetişmiyor): lab'a uygulama içi; seviye yükselince yeniden.
-- * trg_work_orders_appt_risk: teslim tarihi ileri kayınca (prova dönüşü dahil) iş takmaya
--   yetişmiyorsa lab'a hemen bildirim.
-- * fn_daily_order_watch: prova beklemesindeki işler "beklemede" listesine girmez (kendi bildirimi var).
-- * order_history: hekimin "geri gönderdim" işareti + randevu kayıtları.

create or replace function public._prova_watch_collect(p_lab uuid default null)
 returns table(kind text, lab_id uuid, work_order_id uuid, ref_id uuid, level text, late_days integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select 'prova_late'::text, wo.lab_id, wo.id, pr.id, null::text,
         (public.lab_today(wo.lab_id) - public._prova_return_by(pr.id))::integer
    from public.provas pr
    join public.work_orders wo on wo.id = pr.work_order_id
   where pr.status in ('gönderildi', 'onay_bekliyor') and pr.late_notified_at is null
     and wo.status::text not in ('teslim_edildi', 'iptal')
     and (p_lab is null or wo.lab_id = p_lab)
     and public.lab_today(wo.lab_id) > public._prova_return_by(pr.id)
  union all
  select distinct on (wo.id) 'appt_risk'::text, wo.lab_id, wo.id, a.id, r.level, null::integer
    from public.work_orders wo
    cross join lateral public._order_appt_risk(wo.id) r
    join public.order_appointments a
      on a.work_order_id = wo.id and a.kind = 'takma' and a.removed_at is null and a.appt_date = r.takma_date
   where wo.status::text not in ('teslim_edildi', 'iptal')
     and (p_lab is null or wo.lab_id = p_lab)
     and exists (select 1 from public.order_appointments x
                  where x.work_order_id = wo.id and x.kind = 'takma' and x.removed_at is null and x.appt_date is not null)
     and r.level in ('yaklasiyor', 'yetismiyor')
     and (a.risk_notified_level is null or (a.risk_notified_level = 'yaklasiyor' and r.level = 'yetismiyor'));
$function$;

create or replace function public._prova_risk_check(p_order uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; v_a uuid; v_no text;
begin
  select * into r from public._order_appt_risk(p_order);
  if r.level is distinct from 'yetismiyor' then return; end if;
  select a.id into v_a from public.order_appointments a
   where a.work_order_id = p_order and a.kind = 'takma' and a.removed_at is null
     and a.appt_date = r.takma_date and a.risk_notified_level is distinct from 'yetismiyor'
   limit 1;
  if v_a is null then return; end if;
  select order_number into v_no from public.work_orders where id = p_order;
  perform public._prova_notify_lab(p_order, 'Randevuya yetişmiyor',
    '#' || coalesce(v_no, '?') || ' · teslim ' || to_char(r.effective_delivery, 'DD.MM.YYYY')
    || ', takma ' || to_char(r.takma_date, 'DD.MM.YYYY'));
  update public.order_appointments set risk_notified_level = 'yetismiyor' where id = v_a;
end;
$function$;

create or replace function public.trg_appt_risk_fn()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    if exists (select 1 from public.order_appointments a
                where a.work_order_id = new.id and a.kind = 'takma' and a.removed_at is null) then
      perform public._prova_risk_check(new.id);
    end if;
  exception when others then
    null;  -- teslim tarihi güncellemesi uyarı yüzünden asla bozulmaz
  end;
  return null;
end;
$function$;

drop trigger if exists trg_work_orders_appt_risk on public.work_orders;
create trigger trg_work_orders_appt_risk
  after update of delivery_date on public.work_orders
  for each row
  when (new.delivery_date > old.delivery_date and new.status::text not in ('teslim_edildi', 'iptal'))
  execute function public.trg_appt_risk_fn();

create or replace function public.fn_prova_watch()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record; v_no text; v_uid uuid; v_nid uuid; v_title text; v_body text; v_url text; v_sent integer := 0;
  v_secret text; v_hdr jsonb; v_takma date;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_base text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_fn_secret' limit 1;
  exception when others then v_secret := null; end;
  v_hdr := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon,
                              'apikey', v_anon, 'x-notify-secret', coalesce(v_secret, ''));

  for r in select * from public._prova_watch_collect(null) loop
    select order_number into v_no from public.work_orders where id = r.work_order_id;
    v_url := '/order/' || r.work_order_id::text || '?tab=prova';
    if r.kind = 'prova_late' then
      perform public._prova_notify_lab(r.work_order_id, 'Prova ' || r.late_days || ' gün gecikti',
        '#' || coalesce(v_no, '?') || ' · provanın dönmesi gecikti');
      v_title := 'Provanın dönmesi gecikti';
      v_body  := '#' || coalesce(v_no, '?') || ' · prova laboratuvara henüz dönmedi';
      for v_uid in select * from public._order_client_recipients(r.work_order_id) loop
        v_nid := public._notify_inapp(v_uid, 'order_status', v_title, v_body, 'work_order', r.work_order_id, v_url,
                                      jsonb_build_object('order_number', v_no));
        perform net.http_post(
          url := v_base || 'send-email-notification', headers := v_hdr,
          body := jsonb_build_object('userIds', jsonb_build_array(v_uid::text), 'category', 'order_status',
                    'notificationId', v_nid::text,
                    'payload', jsonb_build_object('title', v_title, 'body', v_body, 'actionUrl', v_url,
                                                  'resourceType', 'work_order', 'resourceId', r.work_order_id::text)));
      end loop;
      update public.provas set late_notified_at = now() where id = r.ref_id;
    else
      select appt_date into v_takma from public.order_appointments where id = r.ref_id;
      perform public._prova_notify_lab(r.work_order_id,
        case r.level when 'yetismiyor' then 'Randevuya yetişmiyor' else 'Randevu yaklaşıyor' end,
        '#' || coalesce(v_no, '?') || ' · takma randevusu ' || to_char(v_takma, 'DD.MM.YYYY'));
      update public.order_appointments set risk_notified_level = r.level where id = r.ref_id;
    end if;
    v_sent := v_sent + 1;
  end loop;

  -- risk kalktıysa (tarih değişti) seviye sıfırlanır; yeniden yükselirse yeniden bildirilir
  update public.order_appointments a set risk_notified_level = null
   where a.risk_notified_level is not null and a.removed_at is null
     and coalesce((select r2.level from public._order_appt_risk(a.work_order_id) r2), 'yetisir') = 'yetisir';

  return v_sent;
end;
$function$;

revoke all on function public._prova_watch_collect(uuid) from public, anon, authenticated;
revoke all on function public._prova_risk_check(uuid)    from public, anon, authenticated;
revoke all on function public.trg_appt_risk_fn()         from public, anon, authenticated;
revoke all on function public.fn_prova_watch()           from public, anon, authenticated;

select cron.unschedule('prova-watch') where exists (select 1 from cron.job where jobname = 'prova-watch');
select cron.schedule('prova-watch', '10 8 * * *', 'select public.fn_prova_watch()');

-- ── fn_daily_order_watch: prova beklemesi "beklemede" sayılmaz (canlı tanım + süzgeç) ─────────────
CREATE OR REPLACE FUNCTION public.fn_daily_order_watch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret   text;
  v_lab      record;
  v_uid      uuid;
  v_utype    text;
  v_body     text;
  v_action   text;
  v_notif_id uuid;
  v_items    jsonb;
  v_maxlate  integer;
  v_sent     integer := 0;
  v_anon     text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_base     text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
  v_hdr      jsonb;
  v_fn       text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  v_hdr := jsonb_build_object(
    'Content-Type',    'application/json',
    'Authorization',   'Bearer ' || v_anon,
    'apikey',          v_anon,
    'x-notify-secret', COALESCE(v_secret, '')
  );

  FOR v_lab IN
    SELECT wo.lab_id,
           count(*) FILTER (WHERE wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') AS overdue_ct,
           count(*) FILTER (WHERE (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')) AS hold_ct
      FROM public.work_orders wo
     WHERE wo.lab_id IS NOT NULL
       AND wo.status NOT IN ('teslim_edildi', 'iptal') AND NOT COALESCE(wo.is_archived, false)
       AND (wo.delivery_date < public.lab_today(wo.lab_id) OR (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova'))
     GROUP BY wo.lab_id
     HAVING count(*) FILTER (WHERE wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') > 0
         OR count(*) FILTER (WHERE (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')) > 0
  LOOP
    SELECT
      jsonb_agg(jsonb_build_object(
        'patient', COALESCE(NULLIF(trim(x.patient_name), ''), '—'),
        'clinic',  COALESCE(x.clinic_name, ''),
        'work',    COALESCE(x.work_type, ''),
        'kind',    x.kind,
        'tag',     x.tag,
        'note',    x.note
      ) ORDER BY x.sort_key),
      max(x.days_late) FILTER (WHERE x.kind = 'overdue')
    INTO v_items, v_maxlate
    FROM (
      SELECT wo.patient_name, wo.work_type, c.name AS clinic_name,
             (public.lab_today(wo.lab_id) - wo.delivery_date) AS days_late,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 'hold' ELSE 'overdue' END AS kind,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 'Beklemede'
                  ELSE (public.lab_today(wo.lab_id) - wo.delivery_date) || ' gün gecikti' END AS tag,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')
                  THEN COALESCE(NULLIF(trim(wo.hold_reason), ''),
                         CASE wo.hold_category WHEN 'material' THEN 'Malzeme / parça bekleniyor' ELSE 'Beklemede' END)
                  ELSE NULL END AS note,
             (CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 1 ELSE 0 END) * 1000000 - (public.lab_today(wo.lab_id) - wo.delivery_date) AS sort_key
        FROM public.work_orders wo
        LEFT JOIN public.doctors d ON d.id = wo.doctor_id
        LEFT JOIN public.clinics c ON c.id = d.clinic_id
       WHERE wo.lab_id = v_lab.lab_id
         AND wo.status NOT IN ('teslim_edildi', 'iptal') AND NOT COALESCE(wo.is_archived, false)
         AND ((wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') OR (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova'))
    ) x;

    IF v_lab.overdue_ct > 0 AND v_lab.hold_ct > 0 THEN
      v_body := 'Bugün gözden geçirmen gereken birkaç iş var — ' || v_lab.overdue_ct || ' tanesi gecikmiş'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en fazla ' || v_maxlate || ' gün)' ELSE '' END
        || ', ' || v_lab.hold_ct || ' tanesi de beklemede. Hepsini aşağıya çıkardım.';
    ELSIF v_lab.overdue_ct > 0 THEN
      v_body := 'Bugün ' || v_lab.overdue_ct || ' sipariş gecikmiş durumda'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en gecikmişi ' || v_maxlate || ' gün)' ELSE '' END
        || '. Aşağıda tek tek bulabilirsin:';
    ELSE
      v_body := 'Bugün ' || v_lab.hold_ct || ' sipariş beklemede. Neyi beklediklerini aşağıya çıkardım:';
    END IF;

    FOR v_uid, v_utype IN
      SELECT p.id, p.user_type
        FROM public.profiles p
       WHERE p.lab_id = v_lab.lab_id
         AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    LOOP
      IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = v_uid AND n.category = 'order_watch' AND n.created_at >= (public.lab_today(v_lab.lab_id)::timestamp AT TIME ZONE public.lab_tz(v_lab.lab_id))) THEN
        CONTINUE;
      END IF;

      v_action := CASE WHEN v_utype = 'admin' THEN '/(admin)' ELSE '/(lab)/orders' END;

      INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, action_url, payload)
      VALUES (v_uid, v_lab.lab_id, 'order_watch', 'Bugünün iş takibi', v_body, 'order_watch', v_action,
        jsonb_build_object('overdue', v_lab.overdue_ct, 'onHold', v_lab.hold_ct, 'items', COALESCE(v_items, '[]'::jsonb)))
      RETURNING id INTO v_notif_id;

      FOREACH v_fn IN ARRAY ARRAY['send-email-notification', 'send-expo-push', 'send-web-push', 'send-whatsapp-notification'] LOOP
        PERFORM net.http_post(
          url     := v_base || v_fn,
          headers := v_hdr,
          body    := jsonb_build_object(
            'userIds',        jsonb_build_array(v_uid::text),
            'category',       'order_watch',
            'notificationId', v_notif_id::text,
            'payload',        jsonb_build_object(
              'title', 'Bugünün iş takibi', 'body', v_body, 'actionUrl', v_action,
              'resourceType', 'order_watch', 'items', COALESCE(v_items, '[]'::jsonb)
            )
          )
        );
      END LOOP;

      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END;
$function$;

-- ── order_history: hekim "geri gönderdim" + randevu kayıtları (canlı tanım + iki dal) ─────────────
CREATE OR REPLACE FUNCTION public.order_history(p_order uuid)
 RETURNS TABLE(at timestamp with time zone, kind text, category text, actor_name text, detail jsonb, link_order_id uuid, link_order_no text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_wo     public.work_orders;
  v_lab    boolean;   -- çağıran lab tarafı (lab/admin)
  v_fin    boolean;   -- lab: finans yetkisi
  v_cbill  boolean;   -- klinik/hekim: siparişin kliniğinde fatura yetkisi
  v_tz     text;
begin
  if p_order is null or not public.can_read_work_order(p_order) then
    raise exception 'Bu siparişin geçmişini görme yetkiniz yok.' using errcode = '42501';
  end if;

  select * into v_wo from public.work_orders w where w.id = p_order;
  v_lab := coalesce(public.my_user_type() in ('lab','admin'), false);
  v_fin := v_lab and coalesce(public.lab_can_view_finance(), false);
  v_cbill := (not v_lab) and coalesce(public.can_view_clinic_billing(
               coalesce((select d.clinic_id from public.doctors d where d.id = v_wo.doctor_id),
                        (select p.clinic_id from public.profiles p where p.id = v_wo.doctor_id))), false);
  v_tz := coalesce(public.lab_tz(v_wo.lab_id), 'Europe/Istanbul');

  return query
  with
  -- 20261027140000: yalnız siparişin KENDİ lab'ının kayıtları (başka lab'ın kullanıcısı bir sipariş
  -- kimliğiyle log_activity / doğrudan INSERT yazabiliyordu → sahte satır başka tenant'ın geçmişine düşerdi).
  logs as (
    select l.* from public.activity_logs l
     where l.lab_id = v_wo.lab_id
       and (l.entity_id = p_order
            or l.entity_id in (select s.id from public.order_stages s where s.work_order_id = p_order))
  ),
  -- Olgu satırları (alan/kalem/durum değişikliği, oluşturan, iptal, devir, red) yalnız sunucu
  -- tetikleyicisinin/düzenleme fonksiyonunun yazdığı kayıtlardan: activity_logs_trust_stamp
  -- istemcinin yazdığı satıra 'trusted' koymaz (siparişin tarafı da geçmişi uyduramaz).
  tlogs as (
    select l.* from logs l where l.metadata->>'trusted' = 'true'
  ),
  -- Task 2 alan değişikliği kaydı: metadata.fields = [{field, old, new} | {field, changed}]
  fchg as (
    select l.id, l.created_at, l.actor_id, l.actor_name, e.value as f, e.ordinality as ord
      from tlogs l
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(l.metadata->'fields') = 'array' then l.metadata->'fields' else '[]'::jsonb end
           ) with ordinality e
     where l.entity_type = 'work_order'
  ),
  first_dd as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'delivery_date' order by f.created_at, f.ord limit 1),
  first_notes as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'notes' order by f.created_at, f.ord limit 1),
  creator as (
    select l.actor_id, l.actor_name from tlogs l
     where l.entity_type = 'work_order' and l.action = 'İş emri oluşturdu'
     order by l.created_at limit 1
  ),
  ev(t, k, c, who, who_name, d, lid, lno) as (
    -- oluşturma: o anda söz verilen teslim günü (ilk teslim tarihi değişikliğinin eski değeri)
    select v_wo.created_at, 'created'::text, 'teslim'::text,
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           -- değişiklik kaydı varsa İLK kaydın eski değeri (NULL olsa bile), yoksa bugünkü değer
           jsonb_build_object('delivery_date', case when exists (select 1 from first_dd) then (select x.v from first_dd x)
                                                    else v_wo.delivery_date::text end,
                              'is_urgent', v_wo.is_urgent, 'work_type', v_wo.work_type),
           null::uuid, null::text
    union all
    -- hekim notu: oluşturma anındaki metin
    select v_wo.created_at, 'doctor_note', 'notlar_sohbet',
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           jsonb_build_object('text', left(n.v, 1000)), null, null
      from (select case when exists (select 1 from first_notes) then (select x.v from first_notes x)
                        else v_wo.notes end as v) n
     where nullif(btrim(n.v), '') is not null
    union all
    select f.created_at, 'delivery_date_changed', 'teslim', f.actor_id, f.actor_name,
           jsonb_build_object('old', f.f->>'old', 'new', f.f->>'new'), null, null
      from fchg f where f.f->>'field' = 'delivery_date'
    union all
    -- diğer alanlar: aynı kayıttaki alanlar tek satırda; lab notu klinik/hekime gösterilmez
    select min(f.created_at), 'field_changed', 'diger', (array_agg(f.actor_id))[1], min(f.actor_name),
           jsonb_build_object('fields', jsonb_agg(
             case when f.f ? 'changed' then jsonb_build_object('field', f.f->>'field', 'changed', true)
                  else jsonb_build_object('field', f.f->>'field', 'old', f.f->'old', 'new', f.f->'new') end
             order by f.ord)), null, null
      from fchg f
     where f.f->>'field' not in ('delivery_date', 'status')
       and (v_lab or f.f->>'field' not in ('lab_notes', 'manager_notes'))
     group by f.id
    union all
    -- eski biçim (client_update_order: fields nesnesi, eski değer yok): yalnız alan adları
    select l.created_at, 'field_changed', 'diger', l.actor_id, l.actor_name,
           jsonb_build_object('legacy', true, 'fields',
             (select coalesce(jsonb_agg(jsonb_build_object('field', k.key, 'changed', true)), '[]'::jsonb)
                from jsonb_object_keys(l.metadata->'fields') k(key)
               where v_lab or k.key not in ('lab_notes', 'manager_notes'))), null, null
      from tlogs l
     where l.entity_type = 'work_order' and jsonb_typeof(l.metadata->'fields') = 'object'
    union all
    -- kalemler (Task 2): fiyat alanları yalnız finans/fatura yetkilisine
    select l.created_at, 'items_changed', 'diger', l.actor_id, l.actor_name,
           jsonb_build_object('items',
             (select coalesce(jsonb_agg(case when v_fin or v_cbill then i.value
                                             else i.value - 'price_old' - 'price_new' - 'currency' end
                                        order by i.ordinality), '[]'::jsonb)
                from jsonb_array_elements(l.metadata->'items') with ordinality i)), null, null
      from tlogs l
     where l.entity_type = 'work_order' and jsonb_typeof(l.metadata->'items') = 'array'
    union all
    -- durum adımları; durum notu yalnız lab'a
    select s.created_at, 'status_changed',
           case when s.new_status::text in ('teslimata_hazir','kurye_bekleniyor','kuryede','teslim_edildi')
                then 'teslim' else 'uretim' end,
           s.changed_by, null,
           jsonb_build_object('old', s.old_status::text, 'new', s.new_status::text)
             || case when v_lab and nullif(btrim(s.note), '') is not null
                     then jsonb_build_object('note', s.note) else '{}'::jsonb end,
           null, null
      from public.status_history s where s.work_order_id = p_order
    union all
    -- durum adımları (Task 2 kaydı: status_history'ye yazmayan yollar)
    select f.created_at, 'status_changed',
           case when f.f->>'new' in ('teslimata_hazir','kurye_bekleniyor','kuryede','teslim_edildi')
                then 'teslim' else 'uretim' end,
           f.actor_id, f.actor_name,
           jsonb_build_object('old', f.f->>'old', 'new', f.f->>'new'), null, null
      from fchg f where f.f->>'field' = 'status'
    union all
    -- eski siparişler: teslim durumu status_history'ye yazılmadıysa delivered_at'ten
    select v_wo.delivered_at, 'status_changed', 'teslim', null, null,
           jsonb_build_object('new', 'teslim_edildi', 'derived', true), null, null
     where v_wo.delivered_at is not null
       and not exists (select 1 from public.status_history s
                        where s.work_order_id = p_order and s.new_status::text = 'teslim_edildi')
       and not exists (select 1 from fchg f where f.f->>'field' = 'status' and f.f->>'new' = 'teslim_edildi')
    union all
    select l.created_at, 'order_cancelled', 'diger', l.actor_id, l.actor_name, '{}'::jsonb, null, null
      from tlogs l where l.entity_type = 'work_order' and l.action = 'Siparişi iptal etti'
    union all
    -- aşamalar: yalnız lab
    select x.t, x.k, 'uretim', x.who, null,
           jsonb_build_object('station', st.name) || x.extra, null, null
      from public.order_stages s
      left join public.lab_stations st on st.id = s.station_id
     cross join lateral (values
        (s.assigned_at,  'stage_assigned',  null::uuid,
           jsonb_build_object('technician', public._order_history_name(s.technician_id, true))),
        (s.started_at,   'stage_started',   s.technician_id, '{}'::jsonb),
        (s.completed_at, 'stage_completed', s.technician_id, '{}'::jsonb),
        (s.approved_at,  'stage_approved',  s.approved_by,   '{}'::jsonb),
        (s.skipped_at,   'stage_skipped',   s.skipped_by,    jsonb_build_object('reason', s.skipped_reason))
      ) x(t, k, who, extra)
     where v_lab and s.work_order_id = p_order and x.t is not null
    union all
    -- teknisyen devri (Task 2 kaydı): yalnız lab
    select l.created_at, 'stage_reassigned', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('from', public._order_history_name(nullif(l.metadata->>'from', '')::uuid, true),
                              'to',   public._order_history_name(nullif(l.metadata->>'to', '')::uuid, true),
                              'station', l.metadata->>'station'), null, null
      from tlogs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı devretti'
    union all
    -- kalite reddi (log_stage_activity kaydı): yalnız lab
    select l.created_at, 'stage_rejected', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('station', l.metadata->>'station'), null, null
      from tlogs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı reddetti'
    union all
    -- malzeme tüketimi: yalnız lab; metadata'dan yalnız malzeme alanları (hasta adı alınmaz)
    select l.created_at, 'material_used', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('item', l.metadata->>'item', 'qty', l.metadata->'qty', 'unit', l.metadata->>'unit',
                              'stage', l.metadata->>'stage'), null, null
      from logs l where v_lab and l.entity_type = 'material'
    union all
    -- bekleme: lab kaynaklı beklemenin nedeni klinik/hekime gösterilmez
    select h.started_at, 'hold_started', 'uretim', h.held_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('reason', h.reason, 'category', h.category, 'responsible', h.responsible)
                else '{}'::jsonb end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.started_at is not null
    union all
    select h.ended_at, 'hold_ended', 'uretim', h.resumed_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('responsible', h.responsible, 'extended_days', h.extended_days)
                else '{}'::jsonb end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.ended_at is not null
    union all
    -- kurye bacakları (ara gidişler dahil)
    select x.t, x.k, 'teslim', d.courier_id, case when d.courier_id is null then d.ext_courier_name end,
           jsonb_build_object('purpose', d.purpose, 'direction', d.direction, 'mode', d.mode,
                              'provider', d.external_provider) || x.extra, null, null
      from public.deliveries d
     cross join lateral (values
        (d.assigned_at,  'delivery_assigned',  '{}'::jsonb),
        (d.picked_up_at, 'delivery_picked_up', '{}'::jsonb),
        (d.delivered_at, 'delivery_delivered', jsonb_build_object('recipient_name', d.recipient_name)),
        (d.cancelled_at, 'delivery_cancelled',
           case when v_lab then jsonb_build_object('reason', d.cancel_reason) else '{}'::jsonb end)
      ) x(t, k, extra)
     where d.work_order_id = p_order and x.t is not null
    union all
    -- sohbet: klinik/hekim yalnız onaylı mesajları görür (order_messages kuralı)
    select m.created_at, 'message', 'notlar_sohbet', m.sender_id,
           case when m.sender_id is null then m.external_sender end,
           jsonb_build_object('text', left(m.content, 280), 'attachment_name', m.attachment_name,
                              'attachment_type', m.attachment_type), null, null
      from public.order_messages m
     where m.work_order_id = p_order and (v_lab or m.approval_status = 'approved')
       and coalesce(m.message_type, 'user') not in ('parts_request', 'parts_status')
    union all
    select p.created_at, 'photo', 'diger', p.uploaded_by, null,
           jsonb_build_object('name', regexp_replace(p.storage_path, '^.*/', ''), 'caption', p.caption), null, null
      from public.work_order_photos p where p.work_order_id = p_order
    union all
    -- değişiklik / iptal talepleri: talep ve karar ayrı satır; önerilen değerler değil alan adları
    select r.created_at, 'change_request', 'diger', r.requested_by, r.requester_name,
           jsonb_build_object('step', 'requested', 'items', r.proposed_items is not null, 'fields',
             (select coalesce(jsonb_agg(k.key), '[]'::jsonb)
                from jsonb_object_keys(case when jsonb_typeof(r.proposed_fields) = 'object'
                                            then r.proposed_fields else '{}'::jsonb end) k(key))), null, null
      from public.order_change_requests r where r.work_order_id = p_order
    union all
    select r.reviewed_at, 'change_request', 'diger', r.reviewed_by, null,
           jsonb_build_object('step', 'decided', 'status', r.status, 'note', r.review_note), null, null
      from public.order_change_requests r where r.work_order_id = p_order and r.reviewed_at is not null
    union all
    select r.created_at, 'cancel_request', 'diger', r.requested_by, r.requester_name,
           jsonb_build_object('step', 'requested', 'reason_code', r.reason_code, 'reason', r.reason_detail), null, null
      from public.order_cancellation_requests r where r.work_order_id = p_order
    union all
    select r.reviewed_at, 'cancel_request', 'diger', r.reviewed_by, null,
           jsonb_build_object('step', 'decided', 'status', r.status, 'note', r.review_note), null, null
      from public.order_cancellation_requests r where r.work_order_id = p_order and r.reviewed_at is not null
    union all
    -- prova: tarih alanları gün olarak tutuluyor → date_only (saat gösterilmez)
    select (pr.sent_date::timestamp at time zone v_tz), 'prova_sent', 'teslim', pr.created_by, null,
           jsonb_build_object('date_only', true, 'number', pr.prova_number, 'type', pr.prova_type,
                              'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.sent_date is not null
    union all
    select (pr.return_date::timestamp at time zone v_tz), 'prova_returned', 'teslim', null, null,
           jsonb_build_object('date_only', true, 'number', pr.prova_number, 'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.return_date is not null
    union all
    -- 20261027163000: hekimin "provayı geri gönderdim" işareti
    select pr.client_returned_at, 'prova_client_returned', 'teslim', pr.client_returned_by, null,
           jsonb_build_object('number', pr.prova_number, 'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.client_returned_at is not null
    union all
    -- 20261027163000: randevu kayıtları (appt_save / appt_remove / appt_review güvenilir log yazar)
    select l.created_at, 'appointment', 'teslim', l.actor_id, l.actor_name,
           jsonb_build_object('action', l.action, 'kind', l.metadata->>'kind', 'date', l.metadata->>'date',
                              'time', l.metadata->>'time', 'old_date', l.metadata->>'old_date',
                              'proposal', l.metadata->>'action'), null, null
      from tlogs l where l.entity_type = 'work_order' and l.action like 'Randevu%'
    union all
    -- hekim (tasarım) onayı
    select a.requested_at, 'approval_requested', 'uretim', a.requested_by, null,
           jsonb_build_object('step', a.step_name), null, null
      from public.approvals a where a.work_order_id = p_order and a.requested_at is not null
    union all
    select a.resolved_at, 'approval_decided', 'uretim', a.approved_by, null,
           jsonb_build_object('step', a.step_name, 'status', a.status, 'reason', a.rejection_reason), null, null
      from public.approvals a where a.work_order_id = p_order and a.resolved_at is not null
    union all
    select v_wo.doctor_approval_decided_at, 'approval_decided', 'uretim', v_wo.doctor_approval_decided_by, null,
           jsonb_build_object('status', v_wo.doctor_approval_status, 'override', v_wo.doctor_approval_admin_override),
           null, null
     where v_wo.doctor_approval_decided_at is not null
       and not exists (select 1 from public.approvals a where a.work_order_id = p_order and a.resolved_at is not null)
    union all
    select x.t, 'implant_part', 'diger', x.who, null,
           jsonb_build_object('step', x.st, 'tooth', ip.tooth_number, 'part_type', ip.part_type,
                              'quantity', ip.quantity), null, null
      from public.order_implant_parts ip
     cross join lateral (values
        (ip.requested_at, 'requested', ip.requested_by),
        (ip.ordered_at,   'ordered',   ip.ordered_by),
        (ip.received_at,  'received',  ip.received_by),
        (ip.returned_at,  'returned',  ip.returned_by),
        (ip.cancelled_at, 'cancelled', ip.cancelled_by)
      ) x(t, st, who)
     where ip.work_order_id = p_order and x.t is not null
    union all
    select rv.created_at, 'review', 'notlar_sohbet', rv.rater_id, null,
           jsonb_build_object('overall', rv.overall, 'comment', left(rv.comment, 280)), null, null
      from public.order_reviews rv where rv.work_order_id = p_order
    union all
    -- fatura (kesilmiş) ve tahsilat: yalnız yetkiliye
    select (i.issue_date::timestamp at time zone v_tz), 'invoice_issued', 'diger', null, null,
           jsonb_build_object('date_only', true, 'invoice_number', i.invoice_number, 'status', i.status,
                              'total', i.total, 'currency', i.currency), null, null
      from public.invoices i
     where i.work_order_id = p_order and i.issue_date is not null
       and i.status in ('kesildi', 'kismi_odendi', 'odendi')
       and (v_fin or ((not v_lab) and public.can_view_clinic_billing(i.clinic_id)))
    union all
    select py.created_at, 'payment', 'diger', py.received_by, null,
           jsonb_build_object('amount', py.amount, 'currency', py.currency, 'method', py.payment_method,
                              'payment_date', py.payment_date), null, null
      from public.payments py
      join public.invoices i on i.id = py.invoice_id
     where i.work_order_id = p_order
       and (v_fin or ((not v_lab) and public.can_view_clinic_billing(i.clinic_id)))
    union all
    -- revizyon ve devam bağları (iki yönlü); karşı siparişi okuyamayan bağlantıyı görmez
    select c.created_at, 'revision_opened', 'diger', null, null,
           jsonb_build_object('revision_no', c.revision_no)
             || case when v_lab then jsonb_build_object('reason', c.revision_reason, 'responsible', c.revision_responsible)
                     else '{}'::jsonb end,
           c.id, c.order_number
      from public.work_orders c
     where c.revision_of_id = p_order and public.can_read_work_order(c.id)
    union all
    select v_wo.created_at, 'revision_of', 'diger', null, null,
           jsonb_build_object('revision_no', v_wo.revision_no)
             || case when v_lab then jsonb_build_object('reason', v_wo.revision_reason, 'responsible', v_wo.revision_responsible)
                     else '{}'::jsonb end,
           par.id, par.order_number
      from public.work_orders par
     where par.id = v_wo.revision_of_id and public.can_read_work_order(par.id)
    union all
    select c.created_at, 'continuation_opened', 'diger', null, null, '{}'::jsonb, c.id, c.order_number
      from public.work_orders c
     where c.continues_order_id = p_order and public.can_read_work_order(c.id)
    union all
    select v_wo.created_at, 'continuation_of', 'diger', null, null, '{}'::jsonb, par.id, par.order_number
      from public.work_orders par
     where par.id = v_wo.continues_order_id and public.can_read_work_order(par.id)
  )
  select ev.t, ev.k, ev.c,
         coalesce(public._order_history_name(ev.who, v_lab),
                  case when ev.who is null or v_lab then nullif(ev.who_name, '') end),
         ev.d, ev.lid, ev.lno
    from ev
   where ev.t is not null
   order by ev.t,
            case ev.k when 'created' then 0 when 'revision_of' then 1 when 'continuation_of' then 1
                      when 'doctor_note' then 2 else 3 end;
end;
$function$;

