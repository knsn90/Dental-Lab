-- Toplu tahsilat artık faturalara BAĞLANMIYOR.
--
-- Kullanıcı kararı: "toplu tahsilatları faturalara bağlamayalım, ayrı olsun ama
-- bakiyeden düşsün." Fiş artık kaydedildiğinde hiçbir payments satırı üretmez;
-- tutarın tamamı `unallocated` kalır ve v_clinic_balance bunu bakiyeden düşer
-- (20260924100300). Fatura statüleri ve paid_amount'a dokunulmaz.
--
-- alloc_receipt_to_invoices ve apply_clinic_credit DURUYOR: kullanıcı isterse
-- "Alacağı uygula" ile elle bağlayabilsin diye. Otomatik çağrılan tek yer
-- burasıydı, o çağrı kaldırıldı.

CREATE OR REPLACE FUNCTION public.record_clinic_receipt(
  p_clinic_id       uuid,
  p_lines           jsonb,
  p_receipt_date    date    DEFAULT CURRENT_DATE,
  p_payment_method  text    DEFAULT 'nakit',
  p_reference_no    text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab       uuid;
  v_base_ccy  text;
  v_total     numeric;
  v_receipt   uuid;
  v_l         jsonb;
  v_existing  uuid;
  v_res_dup   jsonb;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM clinic_receipts
     WHERE lab_id = v_lab AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      SELECT jsonb_build_object(
               'receipt_id',     r.id,
               'total_base',     r.total_base,
               'allocated_base', r.allocated_base,
               'credit_base',    r.total_base - r.allocated_base,
               'duplicate',      true,
               'allocations',    '[]'::jsonb)
        INTO v_res_dup
        FROM clinic_receipts r WHERE r.id = v_existing;
      RETURN v_res_dup;
    END IF;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  v_total := receipt_lines_total_base(p_lines);

  INSERT INTO clinic_receipts (lab_id, clinic_id, receipt_date, payment_method,
                               reference_no, notes, received_by, base_currency,
                               total_base, allocated_base, idempotency_key)
  VALUES (v_lab, p_clinic_id, p_receipt_date, p_payment_method,
          p_reference_no, p_notes, auth.uid(), v_base_ccy,
          v_total, 0, p_idempotency_key)
  RETURNING id INTO v_receipt;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
    VALUES (v_receipt, v_l->>'currency', (v_l->>'amount')::numeric,
            (v_l->>'rate')::numeric,
            round((v_l->>'amount')::numeric * (v_l->>'rate')::numeric, 2));
  END LOOP;

  -- Dağıtım YOK: tutarın tamamı alacak olarak durur, bakiyeden view düşer.
  RETURN jsonb_build_object(
    'receipt_id',     v_receipt,
    'total_base',     v_total,
    'allocated_base', 0,
    'credit_base',    v_total,
    'allocations',    '[]'::jsonb);
END $$;

-- Önizleme de artık fatura dağıtımı göstermez; yalnız toplamı doğrular.
CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(
  p_clinic_id uuid,
  p_lines     jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lab uuid; v_total numeric;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  v_total := receipt_lines_total_base(p_lines);
  RETURN jsonb_build_object(
    'total_base', v_total,
    'allocated_base', 0,
    'credit_base', v_total,
    'allocations', '[]'::jsonb);
END $$;
