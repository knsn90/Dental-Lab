-- Revizyonda diş seçimi (20261028130000) — kullanıcı 2026-10-28:
-- "işlem yapılmış dişleri sorsun hangi şeritte ve hangi dişlerde revizyon olacak diye".
-- create_revision_order'a isteğe bağlı p_items eklenir: [{ "item_id": uuid, "teeth": [int, …] }].
--   • p_items NULL → bugünkü davranış birebir (bütün kalemler kopyalanır) — eski istemci bozulmaz.
--   • p_items dolu → yalnız seçilen kalemler, yalnız seçilen dişlerle kopyalanır:
--       - adet hizmet birimine göre: Çene → seçilen dişlerin çene sayısı, Vaka/Seans → değişmez,
--         diğer (diş/Adet/Üye/boş) → seçilen diş sayısı
--       - şerit numaraları seçilenler arasında 1'den yeniden sıralanır (tek şerit kalırsa tek şerit)
--       - siparişin tooth_numbers'ı = seçilen dişlerin birleşimi
--   • en az bir diş seçilmeli; siparişe ait olmayan kalem reddedilir.
-- Parametre eklendiği için eski 5 parametreli imza DÜŞÜRÜLÜR (aynı adla iki aday PostgREST'te belirsizlik
-- yaratırdı); 5 adlı parametreyle yapılan eski çağrı yeni fonksiyona varsayılan p_items=NULL ile oturur.

drop function if exists public.create_revision_order(uuid, text, text, date, uuid);

CREATE OR REPLACE FUNCTION public.create_revision_order(p_order_id uuid, p_reason text, p_responsible text, p_delivery_date date DEFAULT NULL::date, p_fault_station_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_user_type text; v_role text;
  v_src public.work_orders%ROWTYPE; v_new_id uuid; v_free boolean; v_fault uuid;
  v_root text; v_cnt int; v_number text;
  v_teeth int[]; v_bad int; v_rows int;
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

  -- 20261028130000: diş seçimi doğrulaması (yalnız p_items verildiğinde)
  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'Revizyon için en az bir diş seçin'; END IF;
    SELECT count(*) INTO v_bad
      FROM jsonb_array_elements(p_items) e
     WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi
                        WHERE oi.id = public.try_uuid(e->>'item_id') AND oi.work_order_id = p_order_id);
    IF v_bad > 0 THEN RAISE EXCEPTION 'Seçilen iş bu siparişe ait değil'; END IF;
    SELECT ARRAY(
      SELECT DISTINCT t
        FROM jsonb_array_elements(p_items) e
        JOIN public.order_items oi ON oi.id = public.try_uuid(e->>'item_id') AND oi.work_order_id = p_order_id
        CROSS JOIN LATERAL unnest(coalesce(oi.tooth_numbers, '{}'::int[])) t
       WHERE t IN (SELECT x::int FROM jsonb_array_elements_text(coalesce(e->'teeth', '[]'::jsonb)) x)
       ORDER BY t) INTO v_teeth;
    IF coalesce(array_length(v_teeth, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Revizyon için en az bir diş seçin'; END IF;
  END IF;

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
    v_src.patient_city, CASE WHEN p_items IS NULL THEN v_src.tooth_numbers ELSE v_teeth END, v_src.work_type, v_src.shade, v_src.machine_type,
    v_src.model_type, v_src.measurement_type, v_src.input_type, v_src.department, v_src.tags,
    v_src.complexity, v_src.notes, v_src.delivery_method, v_src.priority, v_src.is_urgent,
    v_src.requires_design_approval, v_src.doctor_approval_required,
    COALESCE(p_delivery_date, CURRENT_DATE + 7), 'alindi',
    p_order_id, COALESCE(v_src.revision_no, 0) + 1, trim(p_reason), p_responsible, v_fault
  ) RETURNING id INTO v_new_id;

  IF p_items IS NULL THEN
    INSERT INTO public.order_items (
      work_order_id, lab_id, service_id, name, quantity, notes, tooth_numbers, lane,
      price, currency, price_was_overridden
    )
    SELECT v_new_id, oi.lab_id, oi.service_id, oi.name, oi.quantity, oi.notes, oi.tooth_numbers, oi.lane,
           CASE WHEN v_free THEN 0 ELSE oi.price END,
           oi.currency,
           CASE WHEN v_free THEN TRUE ELSE oi.price_was_overridden END
    FROM public.order_items oi WHERE oi.work_order_id = p_order_id;
  ELSE
    -- yalnız seçilen kalemler, yalnız seçilen dişlerle; adet birime göre; şerit 1'den yeniden
    WITH sel AS (
      SELECT oi.*, ls.unit,
             ARRAY(SELECT t FROM unnest(coalesce(oi.tooth_numbers, '{}'::int[])) t
                    WHERE t IN (SELECT x::int FROM jsonb_array_elements_text(coalesce(e->'teeth', '[]'::jsonb)) x)
                    ORDER BY t) AS new_teeth
        FROM jsonb_array_elements(p_items) e
        JOIN public.order_items oi ON oi.id = public.try_uuid(e->>'item_id') AND oi.work_order_id = p_order_id
        LEFT JOIN public.lab_services ls ON ls.id = oi.service_id
    ), kept AS (
      SELECT sel.*, dense_rank() OVER (ORDER BY coalesce(sel.lane, 1)) AS new_lane
        FROM sel
       WHERE coalesce(array_length(sel.new_teeth, 1), 0) > 0
          OR coalesce(array_length(sel.tooth_numbers, 1), 0) = 0
    )
    INSERT INTO public.order_items (
      work_order_id, lab_id, service_id, name, quantity, notes, tooth_numbers, lane,
      price, currency, price_was_overridden
    )
    SELECT v_new_id, k.lab_id, k.service_id, k.name,
           CASE
             WHEN coalesce(array_length(k.tooth_numbers, 1), 0) = 0 THEN k.quantity
             WHEN k.unit = 'Çene' THEN (SELECT count(DISTINCT CASE WHEN (t / 10) IN (1, 2, 5, 6) THEN 1 ELSE 2 END)::int
                                          FROM unnest(k.new_teeth) t)
             WHEN k.unit IN ('Vaka', 'Seans') THEN k.quantity
             ELSE array_length(k.new_teeth, 1)
           END,
           k.notes,
           CASE WHEN coalesce(array_length(k.tooth_numbers, 1), 0) = 0 THEN k.tooth_numbers ELSE k.new_teeth END,
           CASE WHEN k.lane IS NULL THEN NULL ELSE k.new_lane::int END,
           CASE WHEN v_free THEN 0 ELSE k.price END,
           k.currency,
           CASE WHEN v_free THEN TRUE ELSE k.price_was_overridden END
      FROM kept k;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION 'Revizyon için en az bir diş seçin'; END IF;
  END IF;

  UPDATE public.work_orders SET rework_count = COALESCE(rework_count,0) + 1 WHERE id = p_order_id;
  RETURN v_new_id;
END; $function$;

-- Yetkiler: önceki tanımla aynı (anon dahil; fonksiyon zaten auth.uid() ister)
revoke all on function public.create_revision_order(uuid, text, text, date, uuid, jsonb) from public;
grant execute on function public.create_revision_order(uuid, text, text, date, uuid, jsonb) to anon, authenticated, service_role;
