-- 20261117140000 — Sipariş düzenlemede para birimi korunur + Dt. Esra Güllüoğlu taslakları TL
-- (a) _apply_order_edit: kalem para birimi gelmezse eski kalemin birimi kullanılır
-- (b) Klinik fiyat listesi (TRY): Zirkon Kron/Köprü ₺1.400, Ti-Base Zirkon ₺1.650.
--     Yalnız TASLAK faturalar: F-NEX-2026-0209, 0210, 0223. Ödenmiş/kesilmiş faturalara dokunulmaz.
--     NEX-2026-0219 (Tekirdağ) kalemi açıkça EUR (kullanıcı: 620 €).
-- Kullanıcı onayı 2026-11-17.
BEGIN;

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
  v_tags    text[];
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

  -- 20261113150000: etiketler — dizi gönderildiyse yaz (boş dizi = etiket yok)
  IF p_fields ? 'tags' AND jsonb_typeof(p_fields->'tags') = 'array' THEN
    SELECT coalesce(array_agg(x), '{}'::text[]) INTO v_tags
    FROM jsonb_array_elements_text(p_fields->'tags') AS t(x);
  END IF;

  UPDATE public.work_orders SET
    -- boşsa koru (zorunlu / türetilmiş alanlar)
    patient_name        = coalesce(nullif(trim(p_fields->>'patient_name'), ''), patient_name),
    work_type           = coalesce(p_fields->>'work_type',           work_type),
    delivery_date       = coalesce((p_fields->>'delivery_date')::date, delivery_date),
    is_urgent           = coalesce((p_fields->>'is_urgent')::boolean,  is_urgent),
    tooth_numbers       = coalesce(v_teeth,                          tooth_numbers),
    -- 20261113150000: anahtar varsa yaz, boş → NULL (temizleme artık işler)
    patient_id          = CASE WHEN p_fields ? 'patient_id'          THEN nullif(trim(p_fields->>'patient_id'), '')          ELSE patient_id END,
    patient_gender      = CASE WHEN p_fields ? 'patient_gender'      THEN nullif(trim(p_fields->>'patient_gender'), '')      ELSE patient_gender END,
    patient_dob         = CASE WHEN p_fields ? 'patient_dob'         THEN nullif(trim(p_fields->>'patient_dob'), '')::date   ELSE patient_dob END,
    patient_age         = CASE WHEN p_fields ? 'patient_age'         THEN nullif(trim(p_fields->>'patient_age'), '')::smallint ELSE patient_age END,
    patient_nationality = CASE WHEN p_fields ? 'patient_nationality' THEN nullif(trim(p_fields->>'patient_nationality'), '') ELSE patient_nationality END,
    patient_country     = CASE WHEN p_fields ? 'patient_country'     THEN nullif(trim(p_fields->>'patient_country'), '')     ELSE patient_country END,
    patient_city        = CASE WHEN p_fields ? 'patient_city'        THEN nullif(trim(p_fields->>'patient_city'), '')        ELSE patient_city END,
    shade               = CASE WHEN p_fields ? 'shade'               THEN nullif(trim(p_fields->>'shade'), '')               ELSE shade END,
    model_type          = CASE WHEN p_fields ? 'model_type'          THEN nullif(trim(p_fields->>'model_type'), '')          ELSE model_type END,
    delivery_method     = CASE WHEN p_fields ? 'delivery_method'     THEN nullif(trim(p_fields->>'delivery_method'), '')     ELSE delivery_method END,
    notes               = CASE WHEN p_fields ? 'notes'               THEN nullif(p_fields->>'notes', '')                     ELSE notes END,
    lab_notes           = CASE WHEN p_fields ? 'lab_notes'           THEN nullif(p_fields->>'lab_notes', '')                 ELSE lab_notes END,
    measurement_type    = CASE WHEN p_fields ? 'measurement_type'    THEN nullif(trim(p_fields->>'measurement_type'), '')    ELSE measurement_type END,
    tags                = CASE WHEN v_tags IS NOT NULL THEN v_tags ELSE tags END,
    machine_type        = coalesce(nullif(p_fields->>'machine_type', '')::machine_type, machine_type),
    lab_notes_visible   = coalesce((p_fields->>'lab_notes_visible')::boolean,        lab_notes_visible),
    scan_bodies_delivered    = coalesce((p_fields->>'scan_bodies_delivered')::boolean,    scan_bodies_delivered),
    doctor_approval_required = coalesce((p_fields->>'doctor_approval_required')::boolean, doctor_approval_required),
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
        -- 20261117140000: para birimi gelmezse eskisini koru (aynı adlı kalem → siparişin baskın birimi).
        -- Eskiden NULL kalıyor, lab ana birimine (EUR) düşüp TL fiyatı EUR yapıyordu.
        coalesce(
          nullif(upper(trim(coalesce(v_item->>'currency',''))), ''),
          (SELECT e->>'currency' FROM jsonb_array_elements(v_old_items) e
            WHERE e->>'name' = coalesce(v_item->>'name', '') AND nullif(e->>'currency', '') IS NOT NULL LIMIT 1),
          (SELECT e->>'currency' FROM jsonb_array_elements(v_old_items) e
            WHERE nullif(e->>'currency', '') IS NOT NULL
            GROUP BY e->>'currency' ORDER BY count(*) DESC LIMIT 1)
        ),
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

-- (b) sipariş kalemleri
UPDATE public.order_items SET currency = 'TRY'
 WHERE id = '721d68de-a2a6-4d53-ba8a-8b1307ae9255' AND price = 1400 AND currency IS NULL;          -- NEX-2026-0223
UPDATE public.order_items SET currency = 'TRY', price = 1400
 WHERE id = 'b757b6c3-2d70-401f-85ee-b0a2586bd8a0' AND price = 30 AND currency = 'EUR';            -- NEX-2026-0210
UPDATE public.order_items SET currency = 'TRY', price = 1650
 WHERE id = '00aa07f1-d109-4bd5-b3cc-fa059543413f' AND price = 45 AND currency = 'EUR';            -- NEX-2026-0209
UPDATE public.order_items SET currency = 'EUR'
 WHERE id = 'c18da7d1-7300-4552-9fc0-7242c88369f4' AND price = 620 AND currency IS NULL;           -- NEX-2026-0219

-- (b) taslak faturalar: önce para birimi (kur yeniden çözülür), sonra kalem fiyatı (toplamlar yeniden hesaplanır)
UPDATE public.invoices SET currency = 'TRY'
 WHERE id IN ('feea1753-96e7-4c0d-94e7-66e5386ef1ca','09c892b4-5508-4b2e-9202-bc3141d31769','f0eebb69-132c-4f07-b239-e84d0d6c9dce')
   AND status = 'taslak' AND currency = 'EUR';
UPDATE public.invoice_items SET unit_price = 1400
 WHERE id = '4efe161e-4d88-42e6-83d9-faafdc8468cf' AND unit_price = 30;                           -- F-NEX-2026-0210
UPDATE public.invoice_items SET unit_price = 1650
 WHERE id = '29856fbe-be08-4196-b16a-09c73f4f589a' AND unit_price = 45;                           -- F-NEX-2026-0209

COMMIT;
