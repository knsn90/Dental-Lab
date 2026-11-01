-- 20261027110000_siparis_alan_kaydi.sql
-- 2. dalga 3 (Sipariş "Geçmiş") Task 2: siparişte kim neyi değiştirdi kaydı.
--
-- Neden: bugün teslim tarihi, iş tipi, hekim vb. değişiklikleri iz bırakmıyor; teknisyen devri
-- (ReassignModal technician_id'yi doğrudan yazar) ve durum adımlarının çoğu da (19 fonksiyon status
-- yazar, yalnız update_work_order_status status_history'ye ekler) kayıtsız.
--   1. trg_wo_log_field_changes: izlenen alan gerçekten değişince TEK "Siparişi düzenledi" kaydı,
--      metadata.fields = [{field, old, new}]. Hasta adı/yaşı DEĞERSİZ ({field, changed:true}, KVKK).
--   2. trg_wo_log_status (ertelenmiş): işlem sonunda aynı işlemde status_history satırı yazılmadıysa
--      "Durumu değiştirdi → X" kaydı (fields=[{field:'status',old,new}]). iptal hariç
--      ('Siparişi iptal etti' kaydı zaten var). update_work_order_status yolunda çift kayıt olmaz.
--   3. trg_stage_log_reassign: aşamanın teknisyeni X → Y değişince "Aşamayı devretti".
--   4. _apply_order_edit: kalem farkı → tek "Kalemleri düzenledi" kaydı (eklenen/çıkarılan/değişen).
--   5. client_update_order: kendi kaydı kaldırıldı (aynı değişiklik iki kez görünmesin).
--   6. order_history: durum kaydını ve kalite reddini okur.
-- Güvenlik: tüm yazımlar EXCEPTION WHEN OTHERS içinde — kayıt hatası güncellemeyi bozmaz.
-- Geri alma: rollbacks/20261027110000_siparis_alan_kaydi.down.sql

-- Tek alan farkı → [] ya da [{field, old, new}] (iç yardımcı)
create or replace function public._wo_fc(p_field text, p_old jsonb, p_new jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when p_old is distinct from p_new
              then jsonb_build_array(jsonb_build_object('field', p_field, 'old', p_old, 'new', p_new))
              else '[]'::jsonb end
$function$;

revoke all on function public._wo_fc(text, jsonb, jsonb) from public, anon, authenticated;

create or replace function public._wo_log_field_changes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_f jsonb := '[]'::jsonb;
begin
  begin
    if OLD.patient_name is distinct from NEW.patient_name then
      v_f := v_f || jsonb_build_array(jsonb_build_object('field', 'patient_name', 'changed', true));
    end if;
    if OLD.patient_age is distinct from NEW.patient_age then
      v_f := v_f || jsonb_build_array(jsonb_build_object('field', 'patient_age', 'changed', true));
    end if;
    v_f := v_f
      || public._wo_fc('work_type',        to_jsonb(OLD.work_type),        to_jsonb(NEW.work_type))
      || public._wo_fc('tooth_numbers',    to_jsonb(OLD.tooth_numbers),    to_jsonb(NEW.tooth_numbers))
      || public._wo_fc('shade',            to_jsonb(OLD.shade),            to_jsonb(NEW.shade))
      || public._wo_fc('measurement_type', to_jsonb(OLD.measurement_type), to_jsonb(NEW.measurement_type))
      || public._wo_fc('model_type',       to_jsonb(OLD.model_type),       to_jsonb(NEW.model_type))
      || public._wo_fc('delivery_method',  to_jsonb(OLD.delivery_method),  to_jsonb(NEW.delivery_method))
      || public._wo_fc('delivery_date',    to_jsonb(OLD.delivery_date::text), to_jsonb(NEW.delivery_date::text))
      || public._wo_fc('is_urgent',        to_jsonb(OLD.is_urgent),        to_jsonb(NEW.is_urgent))
      || public._wo_fc('notes',            to_jsonb(left(OLD.notes, 1000)),     to_jsonb(left(NEW.notes, 1000)))
      || public._wo_fc('lab_notes',        to_jsonb(left(OLD.lab_notes, 1000)), to_jsonb(left(NEW.lab_notes, 1000)))
      || public._wo_fc('implant_brand',    to_jsonb(OLD.implant_brand),    to_jsonb(NEW.implant_brand))
      || public._wo_fc('implant_teeth',    to_jsonb(OLD.implant_teeth),    to_jsonb(NEW.implant_teeth))
      || public._wo_fc('implant_details',  OLD.implant_details,            NEW.implant_details);
    -- hekim: kimlik değil ad (ekranda okunur)
    if OLD.doctor_id is distinct from NEW.doctor_id then
      v_f := v_f || jsonb_build_array(jsonb_build_object('field', 'doctor_id',
               'old', public._order_history_name(OLD.doctor_id, true),
               'new', public._order_history_name(NEW.doctor_id, true)));
    end if;
    if jsonb_array_length(v_f) > 0 then
      perform public.log_activity('Siparişi düzenledi', 'work_order', NEW.id, NEW.order_number,
        jsonb_build_object('fields', v_f, 'source', 'trigger'), NEW.lab_id, null);
    end if;
  exception when others then null;
  end;
  return null;
end;
$function$;

revoke all on function public._wo_log_field_changes() from public, anon, authenticated;

drop trigger if exists trg_wo_log_field_changes on public.work_orders;
create trigger trg_wo_log_field_changes
  after update on public.work_orders
  for each row
  when (OLD.patient_name     is distinct from NEW.patient_name
     or OLD.patient_age      is distinct from NEW.patient_age
     or OLD.work_type        is distinct from NEW.work_type
     or OLD.tooth_numbers    is distinct from NEW.tooth_numbers
     or OLD.shade            is distinct from NEW.shade
     or OLD.measurement_type is distinct from NEW.measurement_type
     or OLD.model_type       is distinct from NEW.model_type
     or OLD.delivery_method  is distinct from NEW.delivery_method
     or OLD.delivery_date    is distinct from NEW.delivery_date
     or OLD.doctor_id        is distinct from NEW.doctor_id
     or OLD.is_urgent        is distinct from NEW.is_urgent
     or OLD.notes            is distinct from NEW.notes
     or OLD.lab_notes        is distinct from NEW.lab_notes
     or OLD.implant_brand    is distinct from NEW.implant_brand
     or OLD.implant_teeth    is distinct from NEW.implant_teeth
     or OLD.implant_details  is distinct from NEW.implant_details)
  execute function public._wo_log_field_changes();

-- Durum adımı: işlem SONUNDA çalışır (ertelenmiş kısıt tetikleyicisi). update_work_order_status
-- aynı işlemde status_history'ye yazar (created_at = now() = işlem başı) → o yolda kayıt yazılmaz.
create or replace function public._wo_log_status_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_label text;
begin
  begin
    if NEW.status::text = 'iptal' then return null; end if;
    if exists (select 1 from public.status_history s
                where s.work_order_id = NEW.id and s.new_status = NEW.status and s.created_at >= now()) then
      return null;
    end if;
    v_label := case NEW.status::text
      when 'alindi' then 'Alındı' when 'uretimde' then 'Üretimde' when 'asamada' then 'Aşamada'
      when 'kalite_kontrol' then 'Kalite Kontrol' when 'teslimata_hazir' then 'Teslimata Hazır'
      when 'kurye_bekleniyor' then 'Kurye Bekleniyor' when 'kuryede' then 'Kuryede'
      when 'teslim_edildi' then 'Teslim Edildi' when 'tasarim_onayi_bekleniyor' then 'Tasarım Onayı Bekleniyor'
      else NEW.status::text end;
    perform public.log_activity('Durumu değiştirdi → ' || v_label, 'work_order', NEW.id, NEW.order_number,
      jsonb_build_object(
        'fields', jsonb_build_array(jsonb_build_object('field', 'status', 'old', OLD.status::text, 'new', NEW.status::text)),
        'old_status', OLD.status::text, 'new_status', NEW.status::text,
        'order_no', NEW.order_number, 'source', 'trigger'),
      NEW.lab_id, null);
  exception when others then null;
  end;
  return null;
end;
$function$;

revoke all on function public._wo_log_status_change() from public, anon, authenticated;

drop trigger if exists trg_wo_log_status on public.work_orders;
create constraint trigger trg_wo_log_status
  after update of status on public.work_orders
  deferrable initially deferred
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public._wo_log_status_change();

-- Teknisyen devri: X → Y (ilk atama null → X ve geri alma X → null kayıt değil)
create or replace function public._stage_log_reassign()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ordno text; v_lab uuid; v_station text;
begin
  begin
    select wo.order_number, wo.lab_id into v_ordno, v_lab from public.work_orders wo where wo.id = NEW.work_order_id;
    select st.name into v_station from public.lab_stations st where st.id = NEW.station_id;
    perform public.log_activity('Aşamayı devretti', 'stage', NEW.id,
      coalesce(v_ordno, '') || case when v_station is not null then ' · ' || v_station else '' end,
      jsonb_strip_nulls(jsonb_build_object('order_id', NEW.work_order_id, 'from', OLD.technician_id,
        'to', NEW.technician_id, 'station', v_station, 'order_no', v_ordno, 'source', 'trigger')),
      v_lab, null);
  exception when others then null;
  end;
  return null;
end;
$function$;

revoke all on function public._stage_log_reassign() from public, anon, authenticated;

drop trigger if exists trg_stage_log_reassign on public.order_stages;
create trigger trg_stage_log_reassign
  after update of technician_id on public.order_stages
  for each row
  when (OLD.technician_id is not null and NEW.technician_id is not null
        and OLD.technician_id is distinct from NEW.technician_id)
  execute function public._stage_log_reassign();

-- 4. _apply_order_edit: kalem farkı kaydı (gövdenin geri kalanı canlı tanımla aynı)
CREATE OR REPLACE FUNCTION public._apply_order_edit(p_order_id uuid, p_fields jsonb, p_items jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row     public.work_orders;
  v_item    jsonb;
  v_teeth   int[];
  v_imp     int[];
  v_map     jsonb;
  v_old_items jsonb;   -- 20261027110000: kalem farkı (Kalemleri düzenledi kaydı)
  v_diff    jsonb;
BEGIN
  IF p_fields ? 'tooth_numbers' THEN
    SELECT array_agg((x)::int) INTO v_teeth
    FROM jsonb_array_elements_text(p_fields->'tooth_numbers') AS t(x);
  END IF;

  -- İmplant diş pozisyonları: boş dizi gönderilirse NULL'a düşer (implant kalktı).
  IF p_fields ? 'implant_teeth' AND jsonb_typeof(p_fields->'implant_teeth') = 'array' THEN
    SELECT array_agg((x)::int) INTO v_imp
    FROM jsonb_array_elements_text(p_fields->'implant_teeth') AS t(x);
  END IF;

  UPDATE public.work_orders SET
    patient_name        = coalesce(p_fields->>'patient_name',        patient_name),
    patient_id          = coalesce(p_fields->>'patient_id',          patient_id),
    patient_gender      = coalesce(p_fields->>'patient_gender',      patient_gender),
    patient_dob         = coalesce((p_fields->>'patient_dob')::date, patient_dob),
    patient_age         = coalesce((p_fields->>'patient_age')::smallint, patient_age),
    patient_nationality = coalesce(p_fields->>'patient_nationality', patient_nationality),
    patient_country     = coalesce(p_fields->>'patient_country',     patient_country),
    patient_city        = coalesce(p_fields->>'patient_city',        patient_city),
    work_type           = coalesce(p_fields->>'work_type',           work_type),
    shade               = coalesce(p_fields->>'shade',               shade),
    model_type          = coalesce(p_fields->>'model_type',          model_type),
    delivery_method     = coalesce(p_fields->>'delivery_method',     delivery_method),
    delivery_date       = coalesce((p_fields->>'delivery_date')::date, delivery_date),
    is_urgent           = coalesce((p_fields->>'is_urgent')::boolean,  is_urgent),
    notes               = coalesce(p_fields->>'notes',               notes),
    tooth_numbers       = coalesce(v_teeth,                          tooth_numbers),
    implant_brand       = CASE WHEN p_fields ? 'implant_brand'
                            THEN nullif(trim(coalesce(p_fields->>'implant_brand','')), '')
                            ELSE implant_brand END,
    implant_teeth       = CASE WHEN p_fields ? 'implant_teeth' THEN v_imp ELSE implant_teeth END,
    implant_details     = CASE WHEN p_fields ? 'implant_details'
                            THEN CASE WHEN jsonb_typeof(p_fields->'implant_details') = 'object'
                                        AND p_fields->'implant_details' <> '{}'::jsonb
                                   THEN p_fields->'implant_details' ELSE NULL END
                            ELSE implant_details END,
    updated_at          = now()
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.' USING errcode = 'P0002';
  END IF;

  IF p_items IS NOT NULL THEN
    -- (Faz paralel-şerit) Silme öncesi kalem→şerit eşlemesini imzayla sakla:
    -- tsig = sıralı diş listesi (virgüllü), fallback = isim. Böylece düzenlemede
    -- korunan kalemler şeridini korur (form lane taşımasa bile).
    SELECT jsonb_agg(jsonb_build_object(
      'lane', lane,
      'tsig', (SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(coalesce(tooth_numbers,'{}'::int[])) AS x),
      'name', name
    )) INTO v_map
    FROM public.order_items
    WHERE work_order_id = p_order_id AND lane IS NOT NULL;

    -- 20261027110000: silmeden önce eski kalem kümesi (fark kaydı için)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', name, 'quantity', quantity, 'price', price, 'currency', currency,
      'teeth', (SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(coalesce(tooth_numbers,'{}'::int[])) AS x)
    )), '[]'::jsonb) INTO v_old_items
    FROM public.order_items
    WHERE work_order_id = p_order_id;

    DELETE FROM public.order_items WHERE work_order_id = p_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (work_order_id, name, price, currency, quantity, tooth_numbers, notes)
      VALUES (
        p_order_id,
        coalesce(v_item->>'name', ''),
        coalesce((v_item->>'price')::numeric, 0),
        nullif(upper(trim(coalesce(v_item->>'currency',''))), ''),
        coalesce((v_item->>'quantity')::int, 1),
        CASE WHEN v_item ? 'tooth_numbers'
          THEN (SELECT array_agg((x)::int) FROM jsonb_array_elements_text(v_item->'tooth_numbers') AS t(x))
          ELSE NULL END,
        nullif(v_item->>'notes', '')
      );
    END LOOP;

    -- Lane'i geri yaz: önce diş-imzası eşleşmesi, sonra isim eşleşmesi.
    IF v_map IS NOT NULL THEN
      UPDATE public.order_items ni SET lane = m.lane
      FROM (SELECT (e->>'lane')::int AS lane, e->>'tsig' AS tsig
              FROM jsonb_array_elements(v_map) e WHERE nullif(e->>'tsig','') IS NOT NULL) m
      WHERE ni.work_order_id = p_order_id AND ni.lane IS NULL
        AND (SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(coalesce(ni.tooth_numbers,'{}'::int[])) AS x) = m.tsig;

      UPDATE public.order_items ni SET lane = m.lane
      FROM (SELECT (e->>'lane')::int AS lane, e->>'name' AS name
              FROM jsonb_array_elements(v_map) e) m
      WHERE ni.work_order_id = p_order_id AND ni.lane IS NULL AND ni.name = m.name;
    END IF;

    -- Öksüz şerit temizliği: kalemi kalmayan şeridin YALNIZ BAŞLAMAMIŞ aşamalarını sil.
    -- Başlamış/biten aşamalara (süre/teslimat verisi) asla dokunma. Yalnız kalemlerde
    -- lane tanımlıysa çalış (legacy/tek-şerit siparişi koru).
    IF EXISTS (SELECT 1 FROM public.order_items WHERE work_order_id = p_order_id AND lane IS NOT NULL) THEN
      DELETE FROM public.order_stages os
      WHERE os.work_order_id = p_order_id
        AND os.lane IS NOT NULL
        AND os.status = 'bekliyor'
        AND os.started_at IS NULL AND os.completed_at IS NULL
        AND os.lane NOT IN (SELECT DISTINCT lane FROM public.order_items
                            WHERE work_order_id = p_order_id AND lane IS NOT NULL);
    END IF;

    -- 20261027110000: kalem farkı → tek "Kalemleri düzenledi" kaydı. Eşleşme: aynı ad + aynı
    -- sıra (ad içinde diş/adet/fiyat sırası). Kayıt hatası düzenlemeyi bozmaz.
    BEGIN
      WITH o AS (
        SELECT e->>'name' AS nm, (e->>'quantity')::int AS q, (e->>'price')::numeric AS pr,
               e->>'currency' AS cur, e->>'teeth' AS th,
               row_number() OVER (PARTITION BY e->>'name' ORDER BY e->>'teeth', (e->>'quantity')::int, (e->>'price')::numeric) AS rn
          FROM jsonb_array_elements(v_old_items) e
      ), n0 AS (
        SELECT name AS nm, quantity AS q, price AS pr, currency AS cur,
               (SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(coalesce(tooth_numbers,'{}'::int[])) AS x) AS th
          FROM public.order_items WHERE work_order_id = p_order_id
      ), n AS (
        SELECT n0.*, row_number() OVER (PARTITION BY n0.nm ORDER BY n0.th, n0.q, n0.pr) AS rn FROM n0
      )
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'op', CASE WHEN o.nm IS NULL THEN 'added' WHEN n.nm IS NULL THEN 'removed' ELSE 'changed' END,
               'service', coalesce(n.nm, o.nm),
               'qty_old', o.q, 'qty_new', n.q,
               'price_old', o.pr, 'price_new', n.pr,
               'teeth_old', o.th, 'teeth_new', n.th,
               'currency', coalesce(n.cur, o.cur))))
        INTO v_diff
        FROM o FULL JOIN n ON n.nm = o.nm AND n.rn = o.rn
       WHERE o.nm IS NULL OR n.nm IS NULL
          OR o.q IS DISTINCT FROM n.q OR o.pr IS DISTINCT FROM n.pr
          OR o.cur IS DISTINCT FROM n.cur OR o.th IS DISTINCT FROM n.th;
      IF v_diff IS NOT NULL AND jsonb_array_length(v_diff) > 0 THEN
        PERFORM public.log_activity('Kalemleri düzenledi', 'work_order', p_order_id, v_row.order_number,
          jsonb_build_object('items', v_diff, 'source', 'order_edit'), v_row.lab_id, NULL);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_row;
END;
$function$;

-- 5. client_update_order: kendi kaydı kaldırıldı
CREATE OR REPLACE FUNCTION public.client_update_order(p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.work_orders;
BEGIN
  IF NOT public._client_owns_order(p_order_id) THEN
    RAISE EXCEPTION 'Bu siparişi düzenleme yetkiniz yok.' USING errcode = '42501';
  END IF;
  IF public._order_planning_started(p_order_id) THEN
    RAISE EXCEPTION 'Planlaması başlamış sipariş doğrudan düzenlenemez; değişiklik talebi gerekir.' USING errcode = 'P0001';
  END IF;
  -- 20261027110000: kendi "Siparişi düzenledi" kaydı kaldırıldı — alan değişikliğini work_orders
  -- tetikleyicisi (eski → yeni, hasta alanları değersiz), kalemleri _apply_order_edit yazar.
  -- Eski kayıt p_fields'i (hasta adı dahil) değerleriyle tutuyordu ve aynı değişiklik iki kez görünürdü.
  v_row := public._apply_order_edit(p_order_id, p_fields, p_items);
  RETURN v_row;
END; $function$;

-- 6. order_history: Task 2 durum kaydı + kalite reddi (geri kalanı 20261027100000 ile aynı)
create or replace function public.order_history(p_order uuid)
 returns table(at timestamptz, kind text, category text, actor_name text, detail jsonb,
               link_order_id uuid, link_order_no text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  logs as (
    select l.* from public.activity_logs l
     where l.entity_id = p_order
        or l.entity_id in (select s.id from public.order_stages s where s.work_order_id = p_order)
  ),
  -- Task 2 alan değişikliği kaydı: metadata.fields = [{field, old, new} | {field, changed}]
  fchg as (
    select l.id, l.created_at, l.actor_id, l.actor_name, e.value as f, e.ordinality as ord
      from logs l
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(l.metadata->'fields') = 'array' then l.metadata->'fields' else '[]'::jsonb end
           ) with ordinality e
     where l.entity_type = 'work_order'
  ),
  first_dd as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'delivery_date' order by f.created_at, f.ord limit 1),
  first_notes as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'notes' order by f.created_at, f.ord limit 1),
  creator as (
    select l.actor_id, l.actor_name from logs l
     where l.entity_type = 'work_order' and l.action = 'İş emri oluşturdu'
     order by l.created_at limit 1
  ),
  ev(t, k, c, who, who_name, d, lid, lno) as (
    -- oluşturma: o anda söz verilen teslim günü (ilk teslim tarihi değişikliğinin eski değeri)
    select v_wo.created_at, 'created'::text, 'teslim'::text,
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           jsonb_build_object('delivery_date', coalesce((select x.v from first_dd x), v_wo.delivery_date::text),
                              'is_urgent', v_wo.is_urgent, 'work_type', v_wo.work_type),
           null::uuid, null::text
    union all
    -- hekim notu: oluşturma anındaki metin
    select v_wo.created_at, 'doctor_note', 'notlar_sohbet',
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           jsonb_build_object('text', left(n.v, 1000)), null, null
      from (select coalesce((select x.v from first_notes x), v_wo.notes) as v) n
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
      from logs l
     where l.entity_type = 'work_order' and jsonb_typeof(l.metadata->'fields') = 'object'
    union all
    -- kalemler (Task 2): fiyat alanları yalnız finans/fatura yetkilisine
    select l.created_at, 'items_changed', 'diger', l.actor_id, l.actor_name,
           jsonb_build_object('items',
             (select coalesce(jsonb_agg(case when v_fin or v_cbill then i.value
                                             else i.value - 'price_old' - 'price_new' - 'currency' end
                                        order by i.ordinality), '[]'::jsonb)
                from jsonb_array_elements(l.metadata->'items') with ordinality i)), null, null
      from logs l
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
      from logs l where l.entity_type = 'work_order' and l.action = 'Siparişi iptal etti'
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
      from logs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı devretti'
    union all
    -- kalite reddi (log_stage_activity kaydı): yalnız lab
    select l.created_at, 'stage_rejected', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('station', l.metadata->>'station'), null, null
      from logs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı reddetti'
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
                else jsonb_build_object('responsible', 'lab') end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.started_at is not null
    union all
    select h.ended_at, 'hold_ended', 'uretim', h.resumed_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('responsible', h.responsible, 'extended_days', h.extended_days)
                else jsonb_build_object('responsible', 'lab') end, null, null
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

revoke all on function public.order_history(uuid) from public, anon;
grant execute on function public.order_history(uuid) to authenticated;
