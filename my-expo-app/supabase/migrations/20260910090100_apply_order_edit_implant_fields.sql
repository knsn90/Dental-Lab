-- ═══════════════════════════════════════════════════════════════════════════
-- _apply_order_edit → implant alanlarını da yazsın
--
-- 20260910090000 ile work_orders'a implant_brand / implant_teeth / implant_details
-- eklendi. Düzenleme yolu (client_update_order + admin_update_order → bu fonksiyon)
-- bu alanları taşımıyordu; sihirbazda düzenlenen implant bilgisi kaydedilmiyordu.
--
-- SEMANTİK NOTU: diğer alanlar coalesce(...) ile "verilmediyse dokunma" mantığında.
-- İmplant alanlarında TEMİZLEME de gerekli (vakadan implant çıkarılabilir), o yüzden
-- "anahtar gönderildiyse yaz, gönderilmediyse dokunma" (p_fields ? 'x') kullanılır.
-- İmza değişmiyor → CREATE OR REPLACE yeterli, çağıranlar etkilenmez.
-- ═══════════════════════════════════════════════════════════════════════════

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
