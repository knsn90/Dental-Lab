-- Geri alma: 20261102120000_bekleme_duzeltme
-- Canlıdaki önceki tanımlar (rollbacks/20261102120000_bekleme_duzeltme.before.txt) geri yazılır,
-- sonra eklenen iki sütun kaldırılır (önce işlevler: order_history yeni sütunları okuyor).

CREATE OR REPLACE FUNCTION public.resume_order(p_order uuid, p_started_on date DEFAULT NULL::date, p_ended_on date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lab uuid; v_started timestamptz; v_resp text; v_cat text; v_created timestamptz;
  v_tz text; v_today date; v_sday date; v_eday date; v_floor date; v_prev date;
  v_moved boolean := false; v_end timestamptz; v_days int; v_open uuid[];
begin
  select lab_id, hold_started_at, hold_responsible, hold_category, created_at
    into v_lab, v_started, v_resp, v_cat, v_created
  from public.work_orders where id = p_order for update;

  if v_lab is null or v_lab is distinct from get_my_lab_id() then
    raise exception 'Bu siparisi devam ettirme yetkiniz yok';
  end if;
  -- 20261027161000: prova beklemesi yalnız prova akışıyla (dönüş işareti) kapanır
  if v_cat = 'client_prova' then
    raise exception 'Prova beklemesi prova akışıyla kapanır' using errcode = 'P0001';
  end if;
  -- Eskiden 0 dönüyordu. Teslimde bekleme alanları temizlenir → teslimden sonra geriye dönük bitiş girilemez.
  if v_started is null then
    raise exception 'İş beklemede değil';
  end if;

  v_tz    := public.lab_tz(v_lab);
  v_today := public.lab_today(v_lab, now());
  v_sday  := public.lab_today(v_lab, v_started);

  -- Başlangıç düzeltmesi: yalnız daha erken bir güne
  if p_started_on is not null and p_started_on <> v_sday then
    if p_started_on > v_sday then
      raise exception 'Başlangıç yalnız daha erken bir güne çekilebilir: %', to_char(v_sday, 'DD.MM.YYYY');
    end if;
    v_floor := public.lab_today(v_lab, v_created);
    if p_started_on < v_floor then
      raise exception 'Bekleme başlangıcı siparişin açıldığı günden önce olamaz: %', to_char(v_floor, 'DD.MM.YYYY');
    end if;
    select max(public.lab_today(v_lab, h.ended_at)) into v_prev
      from public.work_order_holds h where h.work_order_id = p_order and h.ended_at is not null;
    if v_prev is not null and p_started_on < v_prev then
      raise exception 'Bekleme başlangıcı önceki beklemenin bittiği günden önce olamaz: %', to_char(v_prev, 'DD.MM.YYYY');
    end if;
    v_started := (p_started_on::timestamp at time zone v_tz);
    v_sday    := p_started_on;
    v_moved   := true;
  end if;

  v_eday := coalesce(p_ended_on, v_today);
  if v_eday > v_today then
    raise exception 'Bitiş günü gelecekte olamaz';
  end if;
  if v_eday < v_sday then
    raise exception 'Bitiş günü başlangıçtan önce olamaz: %', to_char(v_sday, 'DD.MM.YYYY');
  end if;
  v_end := case when v_eday = v_today then now()
                else greatest(v_started, ((v_eday + 1)::timestamp at time zone v_tz) - interval '1 second') end;

  -- 20261027165000: yalnız ŞU AN açık olan bekleme satır(lar)ı kapanır; aşağıdaki UPDATE'in tetiklediği
  -- prova beklemesi (trg_work_orders_prova_reopen) yeni satır açarsa o satıra dokunulmaz.
  select coalesce(array_agg(id), '{}') into v_open
    from public.work_order_holds where work_order_id = p_order and ended_at is null;

  v_days := v_eday - v_sday;
  if coalesce(v_resp, 'client') = 'client' and v_days > 0 then
    update public.work_orders set delivery_date = delivery_date + v_days where id = p_order;
  else
    v_days := 0;
  end if;

  update public.work_orders set
    hold_status = null, hold_reason = null, hold_category = null,
    hold_responsible = null, hold_started_at = null, hold_by = null
  where id = p_order;

  update public.work_order_holds set
    started_at      = case when v_moved then v_started else started_at end,
    ended_at        = v_end,
    extended_days   = v_days,
    resumed_by      = auth.uid(),
    end_recorded_at = now()
  where id = any(v_open);

  return v_days;
end $function$;

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
                     -- 20261102110000: başlangıç sonradan (geçmiş güne) girildiyse girildiği an
                     || case when (h.created_at at time zone v_tz)::date > (h.started_at at time zone v_tz)::date
                             then jsonb_build_object('recorded_at', h.created_at) else '{}'::jsonb end
                else '{}'::jsonb end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.started_at is not null
    union all
    select h.ended_at, 'hold_ended', 'uretim', h.resumed_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('responsible', h.responsible, 'extended_days', h.extended_days)
                     -- 20261102110000: bitiş sonradan girildiyse girildiği an; teslimde kendiliğinden kapandıysa işaret
                     || case when h.end_recorded_at is not null
                              and (h.end_recorded_at at time zone v_tz)::date > (h.ended_at at time zone v_tz)::date
                             then jsonb_build_object('recorded_at', h.end_recorded_at) else '{}'::jsonb end
                     || case when h.end_source = 'delivered' then jsonb_build_object('on_delivery', true) else '{}'::jsonb end
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

alter table public.work_order_holds
  drop column if exists start_recorded_by,
  drop column if exists start_recorded_at;
