-- work_orders.patient_age — siparişte doğum tarihi yerine YAŞ (2026-10-19).
--
-- Yaş, doğum tarihinden daha az kişisel veri; form artık yaş ister. Eski
-- siparişlerdeki patient_dob AYNEN durur (istemci yaşı yoksa tarihten hesaplar:
-- modules/orders/lib/patientAge.ts → orderAge). Belge tarayıcı / Denty tarih
-- bulursa istemcide yaşa çevrilir.
--
-- Fonksiyonlar CANLI tanımlarından (pg_get_functiondef) alınıp yalnız yaş satırı
-- eklendi:
--   _apply_order_edit     → hekim/klinik değişiklik talebi onayında yaş da yazılır
--   create_revision_order → revizyon siparişi yaşı da taşır
--   admin_purge_lab_pii   → KVKK silmede yaş da boşaltılır

alter table public.work_orders
  add column if not exists patient_age smallint
  check (patient_age is null or patient_age between 0 and 120);

comment on column public.work_orders.patient_age is
  'Hasta yaşı (sipariş anındaki). Eski siparişlerde NULL — istemci patient_dob''dan hesaplar.';

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
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_revision_order(p_order_id uuid, p_reason text, p_responsible text, p_delivery_date date DEFAULT NULL::date, p_fault_station_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_user_type text; v_role text;
  v_src public.work_orders%ROWTYPE; v_new_id uuid; v_free boolean; v_fault uuid;
  v_root text; v_cnt int; v_number text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_responsible IS NULL OR p_responsible NOT IN ('lab','client') THEN
    RAISE EXCEPTION 'Sorumluluk secilmeli: lab veya client'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Revizyon sebebi zorunlu'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_src FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_user_type <> 'admin' AND v_src.lab_id IS DISTINCT FROM public.get_my_lab_id() THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF v_src.status <> 'teslim_edildi' THEN
    RAISE EXCEPTION 'Revizyon yalnizca teslim edilmis siparis icin acilabilir (mevcut: %)', v_src.status; END IF;

  v_free := (p_responsible = 'lab');
  v_fault := NULL;
  IF v_free AND p_fault_station_id IS NOT NULL THEN
    SELECT id INTO v_fault FROM public.lab_stations
     WHERE id = p_fault_station_id AND lab_profile_id = v_src.lab_id;
  END IF;

  v_root := regexp_replace(v_src.order_number, '-[0-9]+$', '');
  SELECT count(*) INTO v_cnt FROM public.work_orders
   WHERE lab_id = v_src.lab_id AND order_number ~ ('^' || v_root || '-[0-9]+$');
  v_number := v_root || '-' || (v_cnt + 1);

  INSERT INTO public.work_orders (
    order_number,
    lab_id, doctor_id, doctors_id, patient_name, patient_id, patient_gender, patient_dob, patient_age,
    patient_nationality, patient_country, patient_city, tooth_numbers, work_type, shade,
    machine_type, model_type, measurement_type, input_type, department, tags, complexity,
    notes, delivery_method, priority, is_urgent, requires_design_approval,
    doctor_approval_required, delivery_date, status,
    revision_of_id, revision_no, revision_reason, revision_responsible, revision_fault_station_id
  ) VALUES (
    v_number,
    v_src.lab_id, v_src.doctor_id, v_src.doctors_id, v_src.patient_name, v_src.patient_id,
    v_src.patient_gender, v_src.patient_dob, v_src.patient_age, v_src.patient_nationality, v_src.patient_country,
    v_src.patient_city, v_src.tooth_numbers, v_src.work_type, v_src.shade, v_src.machine_type,
    v_src.model_type, v_src.measurement_type, v_src.input_type, v_src.department, v_src.tags,
    v_src.complexity, v_src.notes, v_src.delivery_method, v_src.priority, v_src.is_urgent,
    v_src.requires_design_approval, v_src.doctor_approval_required,
    COALESCE(p_delivery_date, CURRENT_DATE + 7), 'alindi',
    p_order_id, COALESCE(v_src.revision_no, 0) + 1, trim(p_reason), p_responsible, v_fault
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.order_items (
    work_order_id, lab_id, service_id, name, quantity, notes, tooth_numbers, lane,
    price, currency, price_was_overridden
  )
  SELECT v_new_id, oi.lab_id, oi.service_id, oi.name, oi.quantity, oi.notes, oi.tooth_numbers, oi.lane,
         CASE WHEN v_free THEN 0 ELSE oi.price END,
         oi.currency,
         CASE WHEN v_free THEN TRUE ELSE oi.price_was_overridden END
  FROM public.order_items oi WHERE oi.work_order_id = p_order_id;

  UPDATE public.work_orders SET rework_count = COALESCE(rework_count,0) + 1 WHERE id = p_order_id;
  RETURN v_new_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_purge_lab_pii(p_lab uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name text; v_prof int; v_wo int; v_cli int; v_doc int;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  SELECT name INTO v_name FROM labs WHERE id=p_lab;
  IF v_name IS NULL THEN RAISE EXCEPTION 'lab not found' USING errcode='P0002'; END IF;
  IF btrim(coalesce(p_confirm_name,'')) <> v_name THEN
    RAISE EXCEPTION 'confirmation name mismatch' USING errcode='22023';
  END IF;

  UPDATE profiles SET full_name='Silinmiş kullanıcı', phone=NULL WHERE lab_id=p_lab;
  GET DIAGNOSTICS v_prof = ROW_COUNT;
  UPDATE work_orders SET patient_name='Silindi', patient_id=NULL, patient_dob=NULL, patient_age=NULL,
         patient_nationality=NULL, patient_country=NULL, patient_city=NULL WHERE lab_id=p_lab;
  GET DIAGNOSTICS v_wo = ROW_COUNT;
  UPDATE clinics SET name='Silinmiş klinik', phone=NULL, contact_person=NULL WHERE lab_id=p_lab;
  GET DIAGNOSTICS v_cli = ROW_COUNT;
  UPDATE doctors SET full_name='Silinmiş', phone=NULL WHERE lab_id=p_lab;
  GET DIAGNOSTICS v_doc = ROW_COUNT;
  UPDATE labs SET is_active=false, plan='suspended' WHERE id=p_lab;

  INSERT INTO platform_audit_log(actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'purge_lab_pii', p_lab, jsonb_build_object('profiles',v_prof,'work_orders',v_wo,'clinics',v_cli,'doctors',v_doc));
  RETURN jsonb_build_object('profiles',v_prof,'work_orders',v_wo,'clinics',v_cli,'doctors',v_doc);
END $function$;
