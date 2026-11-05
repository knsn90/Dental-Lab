-- 20261105120000_klinik_genel_oran.down.sql — kliniğin genel oranını fiyat çözümlemesinden çıkarır: resolve_item_price
-- (4 dönüş sütunu, yetkileriyle), create_invoice_from_order ve create_bulk_invoice .before.txt'teki canlı hâline döner;
-- tutarlılık tetikleyicileri/fonksiyonu ve dört gösterim sütunu düşer. Gösterim alanı dolu kalem varsa en başta durur.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Koruma: gösterim alanı dolu kalem varken geri alma bu bilgiyi siler (fiyatlar etkilenmez ama liste fiyatı/oran kaybolur)
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items WHERE list_price IS NOT NULL OR discount_percent IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.invoice_items WHERE list_unit_price IS NOT NULL OR list_discount_pct IS NOT NULL) THEN
    RAISE EXCEPTION 'Liste fiyatı/genel oran gösterimi taşıyan kalemler var: geri almadan önce bu bilginin kaybını kabul edip order_items.list_price/discount_percent ve invoice_items.list_unit_price/list_discount_pct alanlarını NULL yapın; fiyatlar (price/unit_price) değişmez.';
  END IF;
END $guard$;

-- Tutarlılık tetikleyicileri ve fonksiyonu
DROP TRIGGER IF EXISTS list_price_consistency ON public.order_items;
DROP TRIGGER IF EXISTS list_price_consistency ON public.invoice_items;
DROP FUNCTION IF EXISTS public._list_price_consistency();

-- resolve_item_price: 6 → 4 dönüş sütunu (DROP + CREATE), yetkiler .before.txt'teki gibi (authenticated, service_role; PUBLIC/anon yok)
DROP FUNCTION IF EXISTS public.resolve_item_price(uuid, uuid, uuid, date);
CREATE FUNCTION public.resolve_item_price(p_lab_id uuid, p_service_id uuid, p_clinic_id uuid, p_order_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(price numeric, currency text, source text, source_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_price    numeric;
  v_currency      text := 'TRY';
  v_override_id   uuid;
  v_override_price numeric;
  v_override_pct  numeric;
  v_promo_id      uuid;
  v_promo_type    text;
  v_promo_value   numeric;
  v_service_cat   text;
BEGIN
  PERFORM assert_my_lab(p_lab_id);
  -- Servis base fiyatı + kategori
  SELECT s.price, COALESCE(s.currency, 'TRY'), s.category
  INTO v_base_price, v_currency, v_service_cat
  FROM public.lab_services s
  WHERE s.id = p_service_id AND s.lab_id = p_lab_id;

  IF v_base_price IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 'TRY'::text, 'none'::text, NULL::uuid;
    RETURN;
  END IF;

  -- 1) Clinic override (custom_price veya discount_percent)
  IF p_clinic_id IS NOT NULL THEN
    SELECT id, custom_price, discount_percent
    INTO v_override_id, v_override_price, v_override_pct
    FROM public.clinic_price_overrides
    WHERE service_id = p_service_id
      AND clinic_id = p_clinic_id
      AND lab_id = p_lab_id
    LIMIT 1;

    IF v_override_id IS NOT NULL THEN
      IF v_override_price IS NOT NULL THEN
        RETURN QUERY SELECT v_override_price, v_currency, 'clinic_override'::text, v_override_id;
        RETURN;
      ELSIF v_override_pct IS NOT NULL AND v_override_pct > 0 THEN
        RETURN QUERY SELECT
          ROUND(v_base_price * (100 - v_override_pct) / 100, 2),
          v_currency, 'clinic_override'::text, v_override_id;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 2) Promotion (aktif + tarihte geçerli + scope/clinic eşleşmesi)
  SELECT p.id, p.discount_type, p.discount_value
  INTO v_promo_id, v_promo_type, v_promo_value
  FROM public.promotions p
  WHERE p.lab_id = p_lab_id
    AND p.is_active = TRUE
    AND (p.starts_at IS NULL OR p.starts_at <= p_order_date)
    AND (p.ends_at   IS NULL OR p.ends_at   >= p_order_date)
    AND (
      p.scope = 'all'
      OR (p.scope = 'category' AND p.category = v_service_cat)
      OR (p.scope = 'services' AND p.category = v_service_cat)
    )
    AND (
      p.clinic_ids IS NULL
      OR array_length(p.clinic_ids, 1) IS NULL
      OR p_clinic_id::text = ANY(p.clinic_ids)
    )
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_promo_id IS NOT NULL THEN
    IF v_promo_type = 'percent' THEN
      RETURN QUERY SELECT
        ROUND(v_base_price * (100 - v_promo_value) / 100, 2),
        v_currency, 'promotion'::text, v_promo_id;
      RETURN;
    ELSIF v_promo_type = 'fixed' THEN
      RETURN QUERY SELECT
        GREATEST(0, v_base_price - v_promo_value),
        v_currency, 'promotion'::text, v_promo_id;
      RETURN;
    END IF;
  END IF;

  -- 3) Default katalog
  RETURN QUERY SELECT v_base_price, v_currency, 'catalog'::text, p_service_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.resolve_item_price(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_item_price(uuid, uuid, uuid, date) TO authenticated, service_role;

-- create_invoice_from_order (CREATE OR REPLACE → yetkiler korunur)
CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_work_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
  v_base       TEXT;
  v_currency   TEXT;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id, wo.is_urgent
    INTO v_lab_id, v_doctor_id, v_clinic_id, v_is_urgent
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

  -- C-1 tenant guard: an authenticated caller must own the work order's lab
  -- (same rule as invoices_lab_insert RLS). NULL auth.uid() = trusted internal/
  -- service/trigger context (anon EXECUTE is revoked below, so anon cannot reach here).
  IF auth.uid() IS NOT NULL
     AND NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emri için fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  -- 20261025168000: doğrudan (RPC) fatura oluşturma yalnız faturaları yönetebilene açık.
  -- Tetikleyici yolu (teslimde otomatik taslak) serbest: teslimi yapanın finans yetkisi olmayabilir.
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0
     AND NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING errcode = '42501';
  END IF;

  SELECT io.invoice_id INTO v_invoice_id
  FROM invoice_orders io
  JOIN invoices i ON i.id = io.invoice_id
  WHERE io.work_order_id = p_work_order_id AND i.status <> 'iptal'
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  v_due_date := lab_today(v_lab_id) + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', lab_today(v_lab_id), v_due_date, v_currency, auth.uid())
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

  IF NOT EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_invoice_id) THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    SELECT v_invoice_id,
           COALESCE(work_type, 'Laboratuvar hizmeti') ||
             CASE
               WHEN tooth_numbers IS NOT NULL AND array_length(tooth_numbers, 1) > 0
               THEN ' (Dişler: ' || array_to_string(tooth_numbers, ', ') || ')'
               ELSE ''
             END,
           GREATEST(COALESCE(array_length(tooth_numbers, 1), 1), 1),
           0,
           1
    FROM work_orders WHERE id = p_work_order_id;
  END IF;

  IF v_is_urgent THEN
    SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
      FROM lab_settings WHERE lab_id = v_lab_id;
    IF v_rate > 0 THEN
      SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
        FROM invoice_items WHERE invoice_id = v_invoice_id;
      IF v_subtotal > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1,
                ROUND(v_subtotal * v_rate / 100.0, 2),
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  -- Tarama ücretleri (20261028142000): bu siparişe bağlı, siparişle faturalanacak satırlar.
  -- Acil ek ücretten SONRA eklenir → taramaya acil ek ücret uygulanmaz.
  PERFORM public._scan_bill_charges(v_invoice_id, public._scan_order_charge_ids(ARRAY[p_work_order_id], v_currency));

  RETURN v_invoice_id;
END;
$function$
;

-- create_bulk_invoice (Görev 10 imzası; CREATE OR REPLACE → yetkiler korunur)
CREATE OR REPLACE FUNCTION public.create_bulk_invoice(p_clinic_id uuid, p_work_order_ids uuid[], p_due_days integer DEFAULT 30, p_notes text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id   UUID;
  v_lab_id       UUID;
  v_doctor_id    UUID;
  v_doctor_count INT;
  v_sort         INT := 0;
  v_wo           RECORD;
  v_first_wo     UUID;
  v_auto_notes   TEXT;
  v_base         TEXT;
  v_currency     TEXT;
  v_ccy_count    INT;
  v_disc_value   NUMERIC := COALESCE(p_discount_value, 0);
BEGIN
  IF p_work_order_ids IS NULL OR array_length(p_work_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'En az bir sipariş seçmelisiniz';
  END IF;

  SELECT wo.lab_id INTO v_lab_id
  FROM work_orders wo WHERE wo.id = p_work_order_ids[1];

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'İlk sipariş bulunamadı';
  END IF;

  -- H-1 tenant guard: the caller must be an authenticated user of the target lab
  -- (same rule as invoices_lab_insert RLS), or a platform admin. This is a purely
  -- user-facing RPC (no trigger/service caller), so anonymous callers are rejected
  -- outright. Combined with the intra-set 'same clinic & lab' check below, any
  -- mixed-tenant or foreign-lab input is rejected atomically.
  -- 20261028146000: aylık süpürge (cron, oturumsuz) yalnız fn_generate_monthly_invoices'ın koyduğu
  -- işaretle geçer (siman.trusted_invoice + auth.uid() NULL). İstemci yolu için kural aynen.
  IF NOT (auth.uid() IS NULL AND coalesce(current_setting('siman.trusted_invoice', true), '') = 'on')
     AND (auth.uid() IS NULL
          OR NOT (v_lab_id = get_my_lab_id() OR is_platform_admin())) THEN
    RAISE EXCEPTION 'yetkisiz: bu klinik/lab için toplu fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  -- 20261105110000: fatura altı indirim. Tür yoksa değer 0; yüzde 0 < v ≤ 100; tutar v > 0.
  IF p_discount_type IS NULL THEN
    IF v_disc_value <> 0 THEN
      RAISE EXCEPTION 'INV_DISCOUNT_VALUE' USING ERRCODE = '22023';
    END IF;
  ELSIF p_discount_type = 'percent' THEN
    IF NOT (v_disc_value > 0 AND v_disc_value <= 100) THEN
      RAISE EXCEPTION 'INV_DISCOUNT_VALUE' USING ERRCODE = '22023';
    END IF;
  ELSIF p_discount_type = 'fixed' THEN
    IF NOT (v_disc_value > 0) THEN
      RAISE EXCEPTION 'INV_DISCOUNT_VALUE' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'INV_DISCOUNT_VALUE' USING ERRCODE = '22023';
  END IF;

  -- İndirim yalnız fatura yetkisiyle (doğrudan updateInvoice'taki RLS kapısı lab_can_manage_invoices ile aynı);
  -- indirimsiz çağrı (4 argüman) ve aylık süpürge yolu değişmez.
  IF p_discount_type IS NOT NULL
     AND NOT ((auth.uid() IS NULL AND coalesce(current_setting('siman.trusted_invoice', true), '') = 'on')
              OR lab_can_manage_invoices()) THEN
    RAISE EXCEPTION 'Yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM work_orders wo
    LEFT JOIN doctors d ON d.id = wo.doctor_id
    WHERE wo.id = ANY(p_work_order_ids)
      AND (d.clinic_id IS DISTINCT FROM p_clinic_id OR wo.lab_id <> v_lab_id)
  ) THEN
    RAISE EXCEPTION 'Tüm siparişler aynı kliniğe ve laboratuvara ait olmalı';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM unnest(p_work_order_ids) AS wo_id
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo_id AND inv.status <> 'iptal'
    )
  ) THEN
    RAISE EXCEPTION 'Seçili siparişlerin tümü zaten faturalanmış';
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COUNT(DISTINCT COALESCE(oi.currency, v_base)) INTO v_ccy_count
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids);

  IF v_ccy_count > 1 THEN
    RAISE EXCEPTION 'Seçili siparişler farklı para birimlerinde — tek faturada birleştirilemez. Lütfen aynı para birimindekileri ayrı ayrı faturalayın.';
  END IF;

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids)
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  SELECT COUNT(DISTINCT wo.doctor_id) INTO v_doctor_count
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    );

  SELECT wo.doctor_id, wo.id INTO v_doctor_id, v_first_wo
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    )
  ORDER BY wo.created_at
  LIMIT 1;

  v_auto_notes := CASE
    WHEN v_doctor_count > 1
    THEN 'Birden fazla hekimin işleri tek faturada birleştirildi. ' || COALESCE(p_notes, '')
    ELSE p_notes
  END;

  -- İndirim alanları kalemlerden ÖNCE yazılır: kalem eklemeleri recalc_invoice_totals ile indirimi uygular
  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, notes, currency, created_by,
                        discount_type, discount_value)
  VALUES (v_lab_id, v_doctor_id, p_clinic_id, v_first_wo,
          'taslak', lab_today(v_lab_id),
          lab_today(v_lab_id) + (p_due_days || ' days')::INTERVAL,
          NULLIF(TRIM(COALESCE(v_auto_notes, '')), ''),
          v_currency,
          auth.uid(),
          p_discount_type, v_disc_value)
  RETURNING id INTO v_invoice_id;

  FOR v_wo IN
    SELECT wo.*
    FROM work_orders wo
    WHERE wo.id = ANY(p_work_order_ids)
      AND NOT EXISTS (
        SELECT 1 FROM invoice_orders io
        JOIN invoices inv ON inv.id = io.invoice_id
        WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
      )
    ORDER BY wo.created_at
  LOOP
    INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
    VALUES (v_invoice_id, v_wo.id, v_lab_id);

    IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.work_order_id = v_wo.id) THEN
      INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
      SELECT
        v_invoice_id,
        oi.id,
        '[' || v_wo.order_number || '] ' || oi.name,
        oi.quantity,
        oi.price,
        v_sort + ROW_NUMBER() OVER (ORDER BY oi.created_at)
      FROM order_items oi
      WHERE oi.work_order_id = v_wo.id;

      SELECT v_sort + COUNT(*) INTO v_sort
      FROM order_items WHERE work_order_id = v_wo.id;
    ELSE
      v_sort := v_sort + 1;
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (
        v_invoice_id,
        '[' || v_wo.order_number || '] ' ||
          COALESCE(v_wo.work_type, 'Laboratuvar hizmeti') ||
          CASE
            WHEN v_wo.tooth_numbers IS NOT NULL AND array_length(v_wo.tooth_numbers, 1) > 0
            THEN ' (Dişler: ' || array_to_string(v_wo.tooth_numbers, ', ') || ')'
            ELSE ''
          END,
        GREATEST(COALESCE(array_length(v_wo.tooth_numbers, 1), 1), 1),
        0,
        v_sort
      );
    END IF;
  END LOOP;

  -- Tarama ücretleri (20261028142000): faturalanan siparişlere bağlı olanlar + kliniğin
  -- "yalnız tarama" havuzu (aynı para birimi). Acil ek ücret tetikleyicisi tarama satırlarını dışlar.
  PERFORM public._scan_bill_charges(v_invoice_id,
    public._scan_order_charge_ids(p_work_order_ids, v_currency)
    || public._scan_pool_charge_ids(p_clinic_id, v_currency));

  RETURN v_invoice_id;
END;
$function$
;

-- Gösterim sütunları (fonksiyonlar artık okumuyor)
ALTER TABLE public.invoice_items
  DROP COLUMN list_unit_price,
  DROP COLUMN list_discount_pct;
ALTER TABLE public.order_items
  DROP COLUMN list_price,
  DROP COLUMN discount_percent;

COMMIT;
