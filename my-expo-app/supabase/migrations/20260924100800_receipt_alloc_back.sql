-- Tahsilat yine en eski vadeli faturadan başlayarak dağıtılır.
--
-- Kullanıcı kararı: "ödeme alındığında artık en erken tarihli faturaları
-- ödendi saymalı." Faturalar ödenmiş olmadan `gecikmiş` sütunu da temizlenmiyor.
--
-- 20260924100500 ile dağıtımı kaldırmıştık ("faturalara bağlamayalım"); asıl
-- istenen, ekstrede fatura başına ödeme satırı GÖRÜNMEMESİYDİ. Onu istemci
-- tarafında çözüyoruz: fişten gelen ödeme satırları gizlenir, fişin kendisi
-- TEK satır olarak listelenir. Böylece hem defter sade kalır hem fatura
-- statüleri/gecikme doğru olur.

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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM clinic_receipts
     WHERE lab_id = v_lab AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      SELECT jsonb_build_object(
               'receipt_id', r.id, 'total_base', r.total_base,
               'allocated_base', r.allocated_base,
               'credit_base', r.total_base - r.allocated_base,
               'duplicate', true, 'allocations', '[]'::jsonb)
        INTO v_res_dup FROM clinic_receipts r WHERE r.id = v_existing;
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

  UPDATE clinic_receipts SET allocated_base = v_alloc, updated_at = now()
   WHERE id = v_receipt;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt, 'total_base', v_total,
    'allocated_base', v_alloc, 'credit_base', v_total - v_alloc,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'invoice_id', p.invoice_id, 'invoice_no', i.invoice_number,
               'amount', p.amount, 'currency', p.currency))
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.receipt_id = v_receipt), '[]'::jsonb));
END $$;

-- Önizleme yine dağıtımı gösterir (pencerede "hangi fatura kapanacak").
CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(
  p_clinic_id uuid,
  p_lines     jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab uuid; v_total numeric; v_rem numeric; v_inv RECORD;
  v_take numeric; v_rows jsonb := '[]'::jsonb;
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
    v_take := LEAST(floor(v_rem / v_inv.rate * 100) / 100, v_inv.total - v_inv.paid_amount);
    CONTINUE WHEN v_take <= 0;
    v_rows := v_rows || jsonb_build_object(
      'invoice_id', v_inv.id, 'invoice_no', v_inv.invoice_number,
      'amount', v_take, 'currency', v_inv.currency);
    v_rem := v_rem - round(v_take * v_inv.rate, 2);
  END LOOP;

  RETURN jsonb_build_object('total_base', v_total,
    'allocated_base', v_total - v_rem, 'credit_base', v_rem, 'allocations', v_rows);
END $$;
