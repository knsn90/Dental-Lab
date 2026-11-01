-- Geri alma: 20261028146000_aylik_fatura_supurge
select cron.unschedule(jobid) from cron.job where jobname = 'monthly-invoice-sweep';
CREATE OR REPLACE FUNCTION public.create_bulk_invoice(p_clinic_id uuid, p_work_order_ids uuid[], p_due_days integer DEFAULT 30, p_notes text DEFAULT NULL::text)
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
  IF auth.uid() IS NULL
     OR NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu klinik/lab için toplu fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
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

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, notes, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, p_clinic_id, v_first_wo,
          'taslak', CURRENT_DATE,
          CURRENT_DATE + (p_due_days || ' days')::INTERVAL,
          NULLIF(TRIM(COALESCE(v_auto_notes, '')), ''),
          v_currency,
          auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_monthly_invoices()
 RETURNS TABLE(clinic_id uuid, invoice_id uuid, work_order_count integer, error_msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic   RECORD;
  v_orders   uuid[];
  v_due_days int;
  v_inv_id   uuid;
  v_err      text;
BEGIN
  FOR v_clinic IN
    SELECT c.id, COALESCE(c.default_payment_terms_days, 30) AS due_days
    FROM clinics c
    WHERE c.is_active = TRUE
      AND COALESCE(c.billing_mode, 'monthly_bulk') = 'monthly_bulk'
  LOOP
    -- Bu klinik için faturalanmamış teslim edilmiş siparişleri topla
    SELECT array_agg(work_order_id)
    INTO v_orders
    FROM v_unbilled_work_orders
    WHERE clinic_id = v_clinic.id;

    IF v_orders IS NULL OR array_length(v_orders, 1) IS NULL THEN
      -- 20261028142000: faturalanmamış iş emri yok ama "yalnız tarama" havuzu doluysa ayrı taslak
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
      CONTINUE;
    END IF;

    -- create_bulk_invoice'i çağır (taslak fatura oluşur)
    BEGIN
      v_inv_id := public.create_bulk_invoice(
        v_clinic.id,
        v_orders,
        v_clinic.due_days,
        format('Aylık toplu fatura — %s', to_char(now() - interval '1 month', 'TMMonth YYYY'))
      );
      v_err := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_inv_id := NULL;
      v_err    := SQLERRM;
    END;

    clinic_id        := v_clinic.id;
    invoice_id       := v_inv_id;
    work_order_count := array_length(v_orders, 1);
    error_msg        := v_err;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

grant execute on function public.fn_generate_monthly_invoices() to authenticated;
