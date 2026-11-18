-- Dağıtılmış tahsilat düzenlenebilir / silinebilir.
-- Önce: allocated_base > 0 ise update/delete RAISE ediyordu ("faturalara dağıtıldığı için").
-- Şimdi:
--   • Düzenle: makbuzun fatura ödemeleri (payments.receipt_id) silinir → faturalar
--     trg_recalc_payment_state ile yeniden açılır → yeni satırlarla YENİDEN dağıtılır;
--     önce eskiden kapattığı faturalar (aynı sırayla), kalan FIFO. Not/referans
--     düzeltmesi dağıtımı değiştirmez; tutar değişirse fark son faturada/alacakta görünür.
--   • Sil: ödemeleri silinir (faturalar açılır), sonra makbuz silinir.
-- Kilitler: kesinleşmiş fatura kilidi paid_amount/status'a dokunmaz; ekstre indirimi
-- ('indirim') satırları makbuza bağlı değildir, dokunulmaz. Nakit kasa tetikleyicileri izler.
CREATE OR REPLACE FUNCTION public.update_clinic_receipt(p_receipt_id uuid, p_lines jsonb, p_receipt_date date DEFAULT NULL::date, p_payment_method text DEFAULT NULL::text, p_reference_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_r     RECORD;
  v_total numeric;
  v_l     jsonb;
  v_prev  uuid[];
  v_alloc numeric := 0;
  v_date  date;
  v_meth  text;
BEGIN
  SELECT r.id, r.lab_id, r.clinic_id, r.allocated_base, r.base_currency,
         r.receipt_date, r.payment_method
    INTO v_r
    FROM clinic_receipts r WHERE r.id = p_receipt_id
    FOR UPDATE;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'Tahsilat bulunamadı'; END IF;

  IF NOT (is_platform_admin()
          OR (v_r.lab_id = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  v_total := receipt_lines_total_base(p_lines);
  v_date  := COALESCE(p_receipt_date, v_r.receipt_date);
  v_meth  := COALESCE(p_payment_method, v_r.payment_method);

  -- Eski dağıtımı geri al; hangi faturaları hangi sırayla kapattığını hatırla
  SELECT array_agg(invoice_id ORDER BY first_at, invoice_id) INTO v_prev
    FROM (SELECT invoice_id, min(created_at) AS first_at
            FROM payments WHERE receipt_id = p_receipt_id
           GROUP BY invoice_id) s;
  DELETE FROM payments WHERE receipt_id = p_receipt_id AND payment_method <> 'indirim';

  DELETE FROM clinic_receipt_lines WHERE receipt_id = p_receipt_id;
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
    VALUES (p_receipt_id, v_l->>'currency', (v_l->>'amount')::numeric,
            (v_l->>'rate')::numeric,
            round((v_l->>'amount')::numeric * (v_l->>'rate')::numeric, 2));
  END LOOP;

  UPDATE clinic_receipts
     SET total_base     = v_total,
         allocated_base = 0,
         receipt_date   = v_date,
         payment_method = v_meth,
         reference_no   = p_reference_no,
         notes          = p_notes,
         updated_at     = now()
   WHERE id = p_receipt_id;

  -- Yalnız önceden dağıtılmışsa yeniden dağıt (dağıtılmamış fiş eskisi gibi alacak kalır)
  IF COALESCE(v_r.allocated_base, 0) > 0 THEN
    v_alloc := alloc_receipt_to_invoices(p_receipt_id, v_r.clinic_id, v_total,
                                         v_r.base_currency, v_date, v_meth, v_prev);
    UPDATE clinic_receipts SET allocated_base = v_alloc, updated_at = now()
     WHERE id = p_receipt_id;
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', p_receipt_id,
    'total_base', v_total,
    'allocated_base', v_alloc,
    'credit_base', v_total - v_alloc,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'invoice_id', p.invoice_id, 'invoice_no', i.invoice_number,
               'amount', p.amount, 'currency', p.currency))
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.receipt_id = p_receipt_id), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.delete_clinic_receipt(p_receipt_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid;
BEGIN
  SELECT lab_id INTO v_lab
    FROM clinic_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Tahsilat bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;
  -- Fatura ödemeleri önce silinir → faturalar tetikleyiciyle yeniden açılır
  DELETE FROM payments WHERE receipt_id = p_receipt_id AND payment_method <> 'indirim';
  DELETE FROM clinic_receipts WHERE id = p_receipt_id;
END $function$;
