-- Klinik tahsilat fişinin faturalara dağıtımı.
--
-- Tahsis, faturanın KENDİ para biriminde ve KİLİTLİ kuruyla yazılır; tutar
-- faturanın kalanını asla aşmaz. Böylece payments_financial_guard'ın iki kuralı
-- (para birimi eşitliği + fazla ödeme yasağı) kendiliğinden sağlanır ve
-- muhafıza dokunmak gerekmez.
--
-- floor() ŞART: round() yukarı yuvarlayıp elimizdeki bazdan fazlasını tahsis
-- edebilir, o zaman clinic_receipts_alloc_le_total kısıtı patlar.

CREATE OR REPLACE FUNCTION public.alloc_receipt_to_invoices(
  p_receipt_id uuid,
  p_clinic_id  uuid,
  p_base       numeric,
  p_base_ccy   text,
  p_date       date,
  p_method     text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rem  numeric := p_base;
  v_inv  RECORD;
  v_take numeric;
  v_used numeric;
BEGIN
  FOR v_inv IN
    SELECT id, currency, total, paid_amount, COALESCE(rate_at_time, 1) AS rate
      FROM invoices
     WHERE clinic_id = p_clinic_id
       AND status IN ('kesildi','kismi_odendi')
       AND total > paid_amount
     ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_rem <= 0;
    v_take := LEAST(floor(v_rem / v_inv.rate * 100) / 100,
                    v_inv.total - v_inv.paid_amount);
    CONTINUE WHEN v_take <= 0;
    v_used := round(v_take * v_inv.rate, 2);
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method,
                          currency, rate_at_time, amount_base, base_currency_at_time,
                          receipt_id, received_by)
    VALUES (v_inv.id, v_take, p_date, p_method,
            v_inv.currency, v_inv.rate, v_used, p_base_ccy,
            p_receipt_id, auth.uid());
    v_rem := v_rem - v_used;
  END LOOP;
  RETURN p_base - v_rem;
END $$;

-- Satır doğrulama + baz toplamı. record ve preview ortak kullanır.
CREATE OR REPLACE FUNCTION public.receipt_lines_total_base(p_lines jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v_l jsonb; v_sum numeric := 0; v_amt numeric; v_rate numeric; v_ccy text;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'En az bir tahsilat satırı gerekli';
  END IF;
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ccy  := v_l->>'currency';
    v_amt  := (v_l->>'amount')::numeric;
    v_rate := (v_l->>'rate')::numeric;
    IF v_ccy IS NULL OR v_ccy NOT IN ('TRY','EUR','USD','GBP') THEN
      RAISE EXCEPTION 'Geçersiz para birimi: %', COALESCE(v_ccy, 'NULL');
    END IF;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'Tutar sıfırdan büyük olmalı';
    END IF;
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'Kur sıfırdan büyük olmalı';
    END IF;
    v_sum := v_sum + round(v_amt * v_rate, 2);
  END LOOP;
  RETURN v_sum;
END $$;

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
  v_alloc     numeric;
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

  -- Tekrar çağrıda da AYNI şekli döndür; istemci tek bir tip bekliyor.
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
               'allocations', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'invoice_id', p.invoice_id,
                          'invoice_no', i.invoice_number,
                          'amount',     p.amount,
                          'currency',   p.currency))
                   FROM payments p JOIN invoices i ON i.id = p.invoice_id
                  WHERE p.receipt_id = r.id), '[]'::jsonb))
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

  v_alloc := alloc_receipt_to_invoices(v_receipt, p_clinic_id, v_total,
                                       v_base_ccy, p_receipt_date, p_payment_method);

  UPDATE clinic_receipts
     SET allocated_base = v_alloc, updated_at = now()
   WHERE id = v_receipt;

  RETURN jsonb_build_object(
    'receipt_id',     v_receipt,
    'total_base',     v_total,
    'allocated_base', v_alloc,
    'credit_base',    v_total - v_alloc,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'invoice_id', p.invoice_id,
               'invoice_no', i.invoice_number,
               'amount',     p.amount,
               'currency',   p.currency))
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.receipt_id = v_receipt), '[]'::jsonb)
  );
END $$;

-- Yazmadan dağıtım önizlemesi. UI kaydetmeden önce bunu çağırır.
CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(
  p_clinic_id uuid,
  p_lines     jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab   uuid;
  v_total numeric;
  v_rem   numeric;
  v_inv   RECORD;
  v_take  numeric;
  v_rows  jsonb := '[]'::jsonb;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  v_total := receipt_lines_total_base(p_lines);
  v_rem   := v_total;

  FOR v_inv IN
    SELECT id, invoice_number, currency, total, paid_amount,
           COALESCE(rate_at_time, 1) AS rate
      FROM invoices
     WHERE clinic_id = p_clinic_id
       AND status IN ('kesildi','kismi_odendi')
       AND total > paid_amount
     ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC
  LOOP
    EXIT WHEN v_rem <= 0;
    v_take := LEAST(floor(v_rem / v_inv.rate * 100) / 100,
                    v_inv.total - v_inv.paid_amount);
    CONTINUE WHEN v_take <= 0;
    v_rows := v_rows || jsonb_build_object(
      'invoice_id', v_inv.id, 'invoice_no', v_inv.invoice_number,
      'amount', v_take, 'currency', v_inv.currency);
    v_rem := v_rem - round(v_take * v_inv.rate, 2);
  END LOOP;

  RETURN jsonb_build_object(
    'total_base', v_total,
    'allocated_base', v_total - v_rem,
    'credit_base', v_rem,
    'allocations', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.record_clinic_receipt(uuid, jsonb, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_clinic_receipt(uuid, jsonb) TO authenticated;
