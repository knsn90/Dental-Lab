-- DOWN for 20261113150000_siparis_duzenleme_eksik_alanlar — canlı tanımlara (13.11.2026) döner.
DROP TRIGGER IF EXISTS trg_doctor_delete_guard ON public.doctors;
DROP FUNCTION IF EXISTS public._doctor_delete_guard();

CREATE OR REPLACE FUNCTION public.admin_update_order(p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM assert_my_order(p_order_id);
  IF NOT public.is_lab_user() THEN
    RAISE EXCEPTION 'Bu işlem için lab/yönetici yetkisi gerekir.' USING errcode = '42501';
  END IF;
  RETURN public._apply_order_edit(p_order_id, p_fields, p_items);
END;
$function$;

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
          -- 20261027140000: yalnız para birimi yazımı farkı (NULL ↔ 'EUR') değişiklik sayılmaz
          OR o.q IS DISTINCT FROM n.q OR o.pr IS DISTINCT FROM n.pr
          OR o.th IS DISTINCT FROM n.th;
      IF v_diff IS NOT NULL AND jsonb_array_length(v_diff) > 0 THEN
        -- 20261027140000: sunucu yazımı → activity_logs_trust_stamp 'trusted' işaretler
        PERFORM set_config('siman.trusted_log', 'on', true);
        PERFORM public.log_activity('Kalemleri düzenledi', 'work_order', p_order_id, v_row.order_number,
          jsonb_build_object('items', v_diff, 'source', 'order_edit'), v_row.lab_id, NULL);
        PERFORM set_config('siman.trusted_log', '', true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('siman.trusted_log', '', true);
    END;
  END IF;

  RETURN v_row;
END;
$function$;
