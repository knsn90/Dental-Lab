-- ════════════════════════════════════════════════════════════════════════════
-- order_items.currency — kalem bazında para birimi (per-currency doğruluk)
--
-- SORUN: order_items yalnız `price` tutuyordu, para birimi yoktu. Fiyat
-- lab_services'ten (ör. 7,00 EUR) kopyalanıyor, sonra her yerde ₺ diye
-- gösteriliyordu. v_unbilled_work_orders.estimated_total ise para biriminden
-- habersiz SUM() yapıyor → 7 EUR + 500 TRY = 507 gibi anlamsız toplam.
--
-- ÇÖZÜM: kaleme sipariş anındaki para birimi yazılır (resolve_item_price zaten
-- currency döndürüyor, sadece atılıyordu). View per-currency kırılım verir;
-- eski `estimated_total` geriye dönük uyumluluk için KALIR (tek para birimli
-- lablarda aynı sayı), yeni `totals_by_currency` jsonb'si doğru olanıdır.
--
-- Geriye dönük: currency NULL = "bilinmiyor" → lab_settings.default_currency
-- (yoksa TRY) varsayılır. Mevcut kayıtlar aşağıda backfill ediliyor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Kolon ────────────────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_currency_check'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_currency_check
      CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

COMMENT ON COLUMN public.order_items.currency IS
  'Sipariş anındaki kalem para birimi (lab_services.currency''den kopyalanır). NULL = lab varsayılanı.';

-- ── 2) Backfill ─────────────────────────────────────────────────────────────
-- 2a) service_id ile doğrudan eşleşenler
UPDATE public.order_items oi
   SET currency = s.currency
  FROM public.lab_services s
 WHERE oi.currency IS NULL
   AND oi.service_id = s.id
   AND s.currency IS NOT NULL;

-- 2b) service_id boş olanlar — aynı lab'da isim birebir eşleşiyorsa oradan.
--     (Eski kayıtların çoğu katalogdan seçilip service_id yazılmadan geldi.)
UPDATE public.order_items oi
   SET currency = s.currency
  FROM public.lab_services s
 WHERE oi.currency IS NULL
   AND oi.service_id IS NULL
   AND s.lab_id = oi.lab_id
   AND lower(trim(s.name)) = lower(trim(oi.name))
   AND s.currency IS NOT NULL;

-- Kalanlar NULL bırakılır: uydurma para birimi yazmaktansa "bilinmiyor" deyip
-- lab varsayılanına düşmek dürüst davranıştır.

-- ── 3) create_revision_order — kalem kopyasına currency ekle ────────────────
-- (Canlı tanımın birebir kopyası + tek satır fark: oi.currency)
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

  -- Numara: kök (varsa -N eki sıyrılır) + sıradaki ek → revizyonun revizyonu da -3 olur
  v_root := regexp_replace(v_src.order_number, '-[0-9]+$', '');
  SELECT count(*) INTO v_cnt FROM public.work_orders
   WHERE lab_id = v_src.lab_id AND order_number ~ ('^' || v_root || '-[0-9]+$');
  v_number := v_root || '-' || (v_cnt + 1);

  INSERT INTO public.work_orders (
    order_number,
    lab_id, doctor_id, doctors_id, patient_name, patient_id, patient_gender, patient_dob,
    patient_nationality, patient_country, patient_city, tooth_numbers, work_type, shade,
    machine_type, model_type, measurement_type, input_type, department, tags, complexity,
    notes, delivery_method, priority, is_urgent, requires_design_approval,
    doctor_approval_required, delivery_date, status,
    revision_of_id, revision_no, revision_reason, revision_responsible, revision_fault_station_id
  ) VALUES (
    v_number,
    v_src.lab_id, v_src.doctor_id, v_src.doctors_id, v_src.patient_name, v_src.patient_id,
    v_src.patient_gender, v_src.patient_dob, v_src.patient_nationality, v_src.patient_country,
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

-- ── 4) Sipariş düzenleme (klinik + lab) — currency taşınsın ────────────────
CREATE OR REPLACE FUNCTION public._apply_order_edit(p_order_id uuid, p_fields jsonb, p_items jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row   public.work_orders;
  v_item  jsonb;
  v_teeth int[];
BEGIN
  IF p_fields ? 'tooth_numbers' THEN
    SELECT array_agg((x)::int) INTO v_teeth
    FROM jsonb_array_elements_text(p_fields->'tooth_numbers') AS t(x);
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
    updated_at          = now()
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.' USING errcode = 'P0002';
  END IF;

  IF p_items IS NOT NULL THEN
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
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_update_order(p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._client_owns_order(p_order_id) THEN
    RAISE EXCEPTION 'Bu siparişi düzenleme yetkiniz yok.' USING errcode = '42501';
  END IF;
  IF public._order_planning_started(p_order_id) THEN
    RAISE EXCEPTION 'Planlaması başlamış sipariş doğrudan düzenlenemez; değişiklik talebi gerekir.' USING errcode = 'P0001';
  END IF;
  -- Kalem yazımı tek yerde (_apply_order_edit) — currency dahil aynı davranış
  RETURN public._apply_order_edit(p_order_id, p_fields, p_items);
END;
$function$;

-- ── 5) v_unbilled_work_orders — para birimi kırılımı ───────────────────────
-- estimated_total KALIR (geriye dönük uyum); totals_by_currency doğru olanıdır:
--   {"EUR": 7.00, "TRY": 1250.00}
CREATE OR REPLACE VIEW public.v_unbilled_work_orders AS
 SELECT wo.id AS work_order_id,
    wo.lab_id,
    wo.order_number,
    wo.patient_name,
    wo.work_type,
    wo.tooth_numbers,
    wo.delivery_date,
    wo.delivered_at,
    wo.created_at,
    d.id AS doctor_id,
    d.full_name AS doctor_name,
    d.clinic_id,
    c.name AS clinic_name,
    COALESCE(( SELECT sum(oi.quantity::numeric * oi.price) AS sum
           FROM order_items oi
          WHERE oi.work_order_id = wo.id), 0::numeric) AS estimated_total,
    ( SELECT count(*) AS count
           FROM order_items oi
          WHERE oi.work_order_id = wo.id) AS item_count,
    -- YENİ kolon SONA eklenir: CREATE OR REPLACE VIEW yalnız sona ekleme yapar,
    -- araya sokmak "cannot change name of view column" hatası verir.
    COALESCE(( SELECT jsonb_object_agg(t.ccy, t.total)
           FROM ( SELECT COALESCE(oi.currency, ls.default_currency, 'TRY') AS ccy,
                         sum(oi.quantity::numeric * oi.price) AS total
                    FROM order_items oi
                   WHERE oi.work_order_id = wo.id
                   GROUP BY COALESCE(oi.currency, ls.default_currency, 'TRY')) t),
        '{}'::jsonb) AS totals_by_currency
   FROM work_orders wo
     LEFT JOIN doctors d ON d.id = wo.doctor_id
     LEFT JOIN clinics c ON c.id = d.clinic_id
     LEFT JOIN lab_settings ls ON ls.lab_id = wo.lab_id
  WHERE wo.status = 'teslim_edildi'::work_order_status AND NOT (EXISTS ( SELECT 1
           FROM invoice_orders io
             JOIN invoices inv ON inv.id = io.invoice_id
          WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'::text));

NOTIFY pgrst, 'reload schema';
