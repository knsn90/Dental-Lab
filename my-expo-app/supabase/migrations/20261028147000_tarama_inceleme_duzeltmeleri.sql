-- ════════════════════════════════════════════════════════════════════════════
-- Tarama randevuları — son inceleme düzeltmeleri (2026-10-28, kullanıcı: "açık bulguları da düzelt")
-- Ledger: .superpowers/sdd/2026-10-28-tarama-randevulari/progress.md (Final review #1 #3 #5 #6 #7 #8 #9 #10)
--  #1a Fatura iptal edilince ona yazılmış tarama ücretleri serbest kalır (yeniden faturalanabilir)
--  #1b Siparişle faturalanacak ücretin para birimi siparişin faturasından farklıysa atlanıp kaybolmaz:
--      per_order klinik → ayrı taslak, monthly_bulk → havuz (spec 4.8 "para birimi farklıysa")
--  #10 Siparişe bağlı ücret satırının açıklamasında sipariş numarası (spec 4.8 "ayrı taslakta sipariş no")
--  #3  Siparişi gören klinik/hekim bağlı taramanın dosyalarını bulur: scan_order_file_dirs RPC
--  #8  _scan_patient_order yalnız okunabilen + kararla bağlanmış siparişi döndürür (kiracı sızıntısı)
--  #9  order_history tarama satırı yalnız taramayı görebilene / atanmış teknisyene
--  #7  scan_appt_save: hekim o kliniğin olmalı
--  #6  aylık süpürge: karışık para birimli sipariş grubunu düşürmez
--  #5  realtime: scan_appointments + scan_patients publication'a
-- Büyük fonksiyonlar (order_history, scan_appt_save, fn_generate_monthly_invoices) CANLI tanımdan
-- yalnız işaretli satırlar eklenerek yeniden yüklenir (md5 .before.txt'te).
-- ════════════════════════════════════════════════════════════════════════════

-- ── #1a fatura iptali → ücret serbest ──
create or replace function public.trg_scan_invoice_cancelled()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.status = 'iptal' and OLD.status is distinct from 'iptal' then
    begin
      update public.scan_patient_charges c set invoice_item_id = null
        from public.invoice_items ii
       where ii.id = c.invoice_item_id and ii.invoice_id = NEW.id;
    exception when others then
      raise warning 'tarama fatura iptali (%): %', NEW.id, SQLERRM;   -- iptali ASLA engellemez
    end;
  end if;
  return NEW;
end $$;
revoke all on function public.trg_scan_invoice_cancelled() from public, anon, authenticated;
drop trigger if exists trg_scan_invoice_cancelled on public.invoices;
create trigger trg_scan_invoice_cancelled after update of status on public.invoices
  for each row execute function public.trg_scan_invoice_cancelled();

-- ── #1b siparişle faturalanacak ücretler: para birimi SÜZMEZ (farklı olanı _scan_bill_charges ayırır) ──
create or replace function public._scan_order_charge_ids(p_wo_ids uuid[], p_currency text)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  -- p_currency imza uyumu için duruyor; 20261028147000'den beri süzmez
  select coalesce(array_agg(c.id), '{}')
    from public.scan_patient_charges c join public.scan_patients p on p.id = c.scan_patient_id
   where c.status = 'ucretli' and c.invoice_item_id is null and c.bill_with_order
     and p.work_order_id = any (coalesce(p_wo_ids, '{}')) and p.decision in ('siparise_baglandi', 'yeni_siparis');
$$;

-- ── #1b + #10 ücretleri faturaya yazar; siparişe bağlı satırda sipariş no; para birimi farklı olan
-- siparişli ücret atlanmaz: per_order → ayrı taslak, monthly_bulk → havuz ──
create or replace function public._scan_bill_charges(p_invoice uuid, p_charge_ids uuid[])
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_inv public.invoices; v_n int := 0; v_sort int; v_item uuid; r record; g record; v_new uuid;
begin
  if p_invoice is null or p_charge_ids is null or cardinality(p_charge_ids) = 0 then return 0; end if;
  select * into v_inv from public.invoices where id = p_invoice;
  if v_inv.id is null or v_inv.status <> 'taslak' then return 0; end if;
  select coalesce(max(sort_order), 0) into v_sort from public.invoice_items where invoice_id = p_invoice;
  for r in
    select c.id, coalesce(c.price, 0) as price, s.name, a.starts_at, a.lab_id, w.order_number
      from public.scan_patient_charges c
      join public.scan_patients p on p.id = c.scan_patient_id
      join public.scan_appointments a on a.id = p.appointment_id
      join public.lab_services s on s.id = c.service_id
      left join public.work_orders w on w.id = p.work_order_id
     where c.id = any (p_charge_ids) and c.status = 'ucretli' and c.invoice_item_id is null
       and c.currency = v_inv.currency and a.lab_id = v_inv.lab_id
     order by a.starts_at, p.created_at, s.name
     for update of c
  loop
    v_sort := v_sort + 1;
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    values (p_invoice, coalesce(r.name, '') || ' · ' || to_char(r.starts_at at time zone public._scan_tz(r.lab_id), 'DD.MM.YYYY')
                       || coalesce(' · ' || r.order_number, ''),
            1, r.price, v_sort)
    returning id into v_item;
    update public.scan_patient_charges set invoice_item_id = v_item where id = r.id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    update public.invoice_items set sort_order = sort_order where id = v_item;
  end if;
  -- siparişle gidecek ama para birimi bu faturadan farklı ücretler (sipariş sonradan başka para birimine döndü)
  for g in
    select a.clinic_id, c.currency, coalesce(cl.billing_mode, 'monthly_bulk') as mode, array_agg(c.id) as ids
      from public.scan_patient_charges c
      join public.scan_patients p on p.id = c.scan_patient_id
      join public.scan_appointments a on a.id = p.appointment_id
      join public.clinics cl on cl.id = a.clinic_id
     where c.id = any (p_charge_ids) and c.status = 'ucretli' and c.invoice_item_id is null and c.bill_with_order
       and c.currency is distinct from v_inv.currency and a.lab_id = v_inv.lab_id
     group by a.clinic_id, c.currency, coalesce(cl.billing_mode, 'monthly_bulk')
  loop
    update public.scan_patient_charges set bill_with_order = false where id = any (g.ids);
    if g.mode = 'per_order' then
      v_new := public._scan_new_draft(g.clinic_id, g.currency);
      perform public._scan_bill_charges(v_new, g.ids);
    end if;   -- monthly_bulk: havuzda kalır, aylık fatura / "Şimdi faturala" alır
  end loop;
  return v_n;
end $$;
revoke all on function public._scan_order_charge_ids(uuid[], text), public._scan_bill_charges(uuid, uuid[]) from public, anon, authenticated;

-- ── #8 + #3: dosya okuma yolu — sipariş tarafı yalnız KARARLA bağlanmış ve okunabilen siparişe ──
create or replace function public._scan_patient_order(p uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select sp.work_order_id from public.scan_patients sp
   where sp.id = p and sp.work_order_id is not null
     and sp.decision in ('siparise_baglandi', 'yeni_siparis')
     and public.can_read_work_order(sp.work_order_id);
$$;

-- Siparişe bağlı tarama klasörleri (<lab>/<randevu>/<hasta>) — Ekler bu yollarda listeler.
-- Siparişi okuyabilen herkes (klinik/hekim dahil) kararla bağlanmışları; taramayı görebilen lab kullanıcısı hepsini.
create or replace function public.scan_order_file_dirs(p_order uuid)
returns setof text language sql stable security definer set search_path to 'public' as $$
  select sp.lab_id::text || '/' || sp.appointment_id::text || '/' || sp.id::text
    from public.scan_patients sp
   where p_order is not null and sp.work_order_id = p_order
     and public.can_read_work_order(p_order)
     and (sp.decision in ('siparise_baglandi', 'yeni_siparis') or public._scan_can_view());
$$;
revoke all on function public.scan_order_file_dirs(uuid) from public, anon;
grant execute on function public.scan_order_file_dirs(uuid) to authenticated;

-- ── #6 yardımcı: siparişin kalemleri birden çok para biriminde mi (create_bulk_invoice'in kuralı) ──
create or replace function public._scan_wo_mixed_currency(p_wo uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select count(distinct coalesce(oi.currency, coalesce(ls.default_currency, 'TRY'))) > 1
    from public.order_items oi
    join public.work_orders w on w.id = oi.work_order_id
    left join public.lab_settings ls on ls.lab_id = w.lab_id
   where oi.work_order_id = p_wo;
$$;
revoke all on function public._scan_wo_mixed_currency(uuid) from public, anon, authenticated;

-- ── #9 order_history (canlı tanım + tarama satırı süzgeci) ──
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
    union all
    -- 20261028143000: tarama randevusu olayları (karar/geri alma; metadata.work_order_id) — YALNIZ lab
    select sl.created_at, 'scan', 'diger', sl.actor_id, sl.actor_name,
           jsonb_build_object('action', sl.action, 'decision', sl.metadata->>'decision',
                              'appointment_id', sl.entity_id, 'label', sl.entity_label), null, null
      from public.activity_logs sl
     where v_lab and sl.lab_id = v_wo.lab_id and sl.entity_type = 'scan_appointment'
       -- 20261028147000: yalnız taramayı görebilen (view_/manage_) ya da randevu kendisine atanmış teknisyen
       and (public._scan_can_view()
            or exists (select 1 from public.scan_appointments sa where sa.id = sl.entity_id and sa.technician_id = auth.uid()))
       and sl.metadata->>'trusted' = 'true'
       and sl.metadata->>'work_order_id' = p_order::text
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

-- ── #7 scan_appt_save (canlı tanım + hekim kontrolü) ──
CREATE OR REPLACE FUNCTION public.scan_appt_save(p_id uuid, p_clinic uuid, p_doctor uuid, p_starts_at timestamp with time zone, p_minutes integer, p_technician uuid, p_source text, p_note text, p_services jsonb, p_intent text DEFAULT 'belirsiz'::text, p_order uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lab uuid := public.get_my_lab_id();
  v_old public.scan_appointments;
  v_a   public.scan_appointments;
  r record;
  v_kind text; v_ekind text;
  v_ids uuid[] := '{}';
  v_intent text := coalesce(nullif(p_intent, ''), 'belirsiz');
  v_order uuid := case when coalesce(nullif(p_intent, ''), 'belirsiz') = 'mevcut_siparis' then p_order else null end;
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not public._scan_can_manage() then raise exception 'Bu işlem için yetkiniz yok' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clinics where id = p_clinic and lab_id = v_lab) then
    raise exception 'Klinik bu lab''a ait değil' using errcode = 'P0001';
  end if;
  -- 20261028147000: hekim seçilmişse o kliniğin hekimi olmalı (klinik değişip eski hekim kalmasın)
  if p_doctor is not null and not exists (select 1 from public.doctors d where d.id = p_doctor and d.clinic_id = p_clinic) then
    raise exception 'Hekim bu kliniğe ait değil' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_technician and lab_id = v_lab and user_type = 'lab') then
    raise exception 'Teknisyen bu lab''a ait değil' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 600 then
    raise exception 'Süre 15 ile 600 dakika arasında olmalı' using errcode = 'P0001';
  end if;
  if v_intent not in ('mevcut_siparis', 'yeni_siparis', 'yalniz_tarama', 'belirsiz') then
    raise exception 'Geçersiz seçim' using errcode = 'P0001';
  end if;
  if v_order is not null then
    if not exists (select 1 from public.work_orders w
                    where w.id = v_order and w.lab_id = v_lab and public._resolve_wo_clinic_id(w.id) = p_clinic) then
      raise exception 'Sipariş bu kliniğe ait değil' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.work_orders where id = v_order and status = 'iptal') then
      raise exception 'İptal edilmiş siparişe bağlanamaz' using errcode = 'P0001';
    end if;
  end if;
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) = 0 then
    raise exception 'Tarama hizmeti seçin' using errcode = 'P0001';
  end if;
  for r in select (e->>'service_id')::uuid as sid, nullif(e->>'equipment_id', '')::uuid as eid
             from jsonb_array_elements(p_services) e loop
    select scan_kind into v_kind from public.lab_services where id = r.sid and lab_id = v_lab;
    if v_kind is null then raise exception 'Tarama hizmeti seçin' using errcode = 'P0001'; end if;
    if r.eid is not null then
      select scan_kind into v_ekind from public.equipment where id = r.eid and lab_id = v_lab;
      if v_ekind is distinct from v_kind then
        raise exception 'Cihaz bu hizmetin türüne uymuyor' using errcode = 'P0001';
      end if;
    end if;
    v_ids := v_ids || r.sid;
  end loop;

  if p_id is null then
    insert into public.scan_appointments (lab_id, clinic_id, doctor_id, starts_at, duration_min, technician_id,
                                          source, note, created_by, intent, intended_order_id)
    values (v_lab, p_clinic, p_doctor, p_starts_at, p_minutes, p_technician,
            coalesce(nullif(p_source, ''), 'telefon'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(),
            v_intent, v_order)
    returning * into v_a;
  else
    v_old := public._scan_lock_appt(p_id, false);
    if v_old.status <> 'planlandi' then
      raise exception 'Yalnız planlanmış randevu değiştirilebilir' using errcode = 'P0001';
    end if;
    update public.scan_appointments
       set clinic_id = p_clinic, doctor_id = p_doctor, starts_at = p_starts_at, duration_min = p_minutes,
           technician_id = p_technician, source = coalesce(nullif(p_source, ''), 'telefon'),
           note = nullif(btrim(coalesce(p_note, '')), ''), intent = v_intent, intended_order_id = v_order,
           updated_at = now()
     where id = p_id returning * into v_a;
  end if;

  -- hizmetleri eşitle (çıkarılan hizmetin hasta ücret satırları da gider)
  delete from public.scan_patient_charges c using public.scan_patients p
   where c.scan_patient_id = p.id and p.appointment_id = v_a.id and not (c.service_id = any (v_ids));
  delete from public.scan_appointment_services where appointment_id = v_a.id and not (service_id = any (v_ids));
  insert into public.scan_appointment_services (lab_id, appointment_id, service_id, equipment_id)
  select v_lab, v_a.id, (e->>'service_id')::uuid, nullif(e->>'equipment_id', '')::uuid
    from jsonb_array_elements(p_services) e
  on conflict (appointment_id, service_id) do update set equipment_id = excluded.equipment_id;

  if p_id is null then
    perform public.log_activity('Tarama randevusu oluşturdu', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('clinic_id', v_a.clinic_id, 'technician_id', v_a.technician_id,
                                                   'starts_at', v_a.starts_at, 'source', v_a.source, 'intent', v_intent));
    perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Yeni tarama randevusu', v_a.id);
  else
    perform public.log_activity('Tarama randevusunu değiştirdi', 'scan_appointment', v_a.id, public._scan_appt_label(v_a.id),
                                jsonb_build_object('starts_at', jsonb_build_object('old', v_old.starts_at, 'new', v_a.starts_at),
                                                   'technician_id', jsonb_build_object('old', v_old.technician_id, 'new', v_a.technician_id)));
    if v_old.technician_id is distinct from v_a.technician_id then
      perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Yeni tarama randevusu', v_a.id);
      perform public._scan_notify_tech(v_old.technician_id, v_lab, 'Tarama randevusu değişti', v_a.id);
    elsif v_old.starts_at is distinct from v_a.starts_at then
      perform public._scan_notify_tech(v_a.technician_id, v_lab, 'Tarama randevusu değişti', v_a.id);
    end if;
  end if;
  return v_a.id;
end $function$;

-- ── #6 fn_generate_monthly_invoices (canlı tanım + karışık para birimi ayrımı) ──
CREATE OR REPLACE FUNCTION public.fn_generate_monthly_invoices()
 RETURNS TABLE(clinic_id uuid, invoice_id uuid, work_order_count integer, error_msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic   RECORD;
  v_grp      RECORD;
  v_inv_id   uuid;
  v_err      text;
  v_note     text := 'Aylık toplu fatura · ' || to_char(now() - interval '1 month', 'MM.YYYY');  -- "Sabit · değişken" (autoT)
BEGIN
  -- 20261028146000 "süpürge": create_bulk_invoice'in oturumsuz (cron) yolu bu işaretle açılır; sonunda kapanır
  PERFORM set_config('siman.trusted_invoice', 'on', true);
  FOR v_clinic IN
    SELECT c.id, COALESCE(c.default_payment_terms_days, 30) AS due_days
    FROM clinics c
    WHERE c.is_active = TRUE
      AND COALESCE(c.billing_mode, 'monthly_bulk') = 'monthly_bulk'
  LOOP
    -- Gözden kaçan teslim edilmiş siparişler, para birimine göre (create_invoice_from_order'ın kuralı);
    -- create_bulk_invoice karışık para birimini reddettiği için her para birimine ayrı taslak.
    -- (Sorgular nitelendi: çıktı sütunu clinic_id ile çakışıyordu → 42702, fonksiyon hiç çalışmıyordu.)
    FOR v_grp IN
      SELECT public._scan_order_currency(u.work_order_id) AS ccy, array_agg(u.work_order_id) AS ids
        FROM v_unbilled_work_orders u
       WHERE u.clinic_id = v_clinic.id
         -- 20261028147000: karışık para birimli sipariş grubu düşürmesin (create_bulk_invoice reddeder) → aşağıda ayrı
         AND NOT public._scan_wo_mixed_currency(u.work_order_id)
       GROUP BY 1
    LOOP
      BEGIN
        v_inv_id := public.create_bulk_invoice(v_clinic.id, v_grp.ids, v_clinic.due_days, v_note);
        v_err := NULL;
      EXCEPTION WHEN OTHERS THEN
        v_inv_id := NULL;
        v_err    := SQLERRM;
      END;
      clinic_id        := v_clinic.id;
      invoice_id       := v_inv_id;
      work_order_count := array_length(v_grp.ids, 1);
      error_msg        := v_err;
      RETURN NEXT;
    END LOOP;

    -- Karışık para birimli siparişler: faturalanmaz, elle faturalansın diye hata satırı döner
    FOR v_grp IN
      SELECT NULL::text AS ccy, array_agg(u.work_order_id) AS ids
        FROM v_unbilled_work_orders u
       WHERE u.clinic_id = v_clinic.id AND public._scan_wo_mixed_currency(u.work_order_id)
      HAVING count(*) > 0
    LOOP
      clinic_id        := v_clinic.id;
      invoice_id       := NULL;
      work_order_count := array_length(v_grp.ids, 1);
      error_msg        := 'Karışık para birimli sipariş · elle faturalayın';
      RETURN NEXT;
    END LOOP;

    -- "Yalnız tarama" havuzunda kalanlar (siparişli faturaya girmeyen para birimleri dahil)
    IF cardinality(public._scan_pool_charge_ids(v_clinic.id, NULL)) > 0 THEN
      BEGIN
        v_inv_id := (public._scan_monthly_pool_invoices(v_clinic.id))[1];
        v_err := NULL;
      EXCEPTION WHEN OTHERS THEN
        v_inv_id := NULL;
        v_err := SQLERRM;
      END;
      clinic_id        := v_clinic.id;
      invoice_id       := v_inv_id;
      work_order_count := 0;
      error_msg        := v_err;
      RETURN NEXT;
    END IF;
  END LOOP;

  PERFORM set_config('siman.trusted_invoice', '', true);
  RETURN;
END;
$function$;
revoke all on function public.fn_generate_monthly_invoices() from public, anon, authenticated;

-- ── #5 realtime ──
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scan_appointments') then
    alter publication supabase_realtime add table public.scan_appointments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scan_patients') then
    alter publication supabase_realtime add table public.scan_patients;
  end if;
end $$;
