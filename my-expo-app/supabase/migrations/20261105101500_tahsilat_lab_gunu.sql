-- 20261105101500_tahsilat_lab_gunu.sql — Klinik tahsilatında gece UTC tarihi düzeltmesi.
--
-- Sorun: record_clinic_receipt'in tarih varsayılanı ve apply_clinic_credit'in ödeme tarihi
-- CURRENT_DATE idi. CURRENT_DATE oturumun saat dilimine (Supabase'de UTC) göre çözülür;
-- Türkiye'de 00:00–03:00 arası alınan tahsilat ve uygulanan alacak bir önceki günün
-- tarihini alıyordu (ekstre, kasa, dönem raporları yanlış güne düşüyordu).
--
-- Çözüm: lab_today(lab) (labs.timezone; boşsa Europe/Istanbul).
--   • record_clinic_receipt: parametre varsayılanı lab'a bağlanamaz → DEFAULT NULL +
--     gövdede COALESCE(p_receipt_date, lab_today(v_lab)). Açık tarih veren çağrı değişmez.
--   • apply_clinic_credit: alacak uygulamasının ödeme tarihi lab_today(v_lab).
--   • update_clinic_receipt DEĞİŞMİYOR (CURRENT_DATE kullanmıyor; boş tarih eskisini korur).
-- İmza, dönüş tipi, yetki kontrolü ve izinler aynı (CREATE OR REPLACE ACL'yi korur).
-- Geri alma: supabase/rollbacks/20261105101500_tahsilat_lab_gunu.down.sql

CREATE OR REPLACE FUNCTION public.record_clinic_receipt(p_clinic_id uuid, p_lines jsonb, p_receipt_date date DEFAULT NULL::date, p_payment_method text DEFAULT 'nakit'::text, p_reference_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab       uuid;
  v_base_ccy  text;
  v_total     numeric;
  v_receipt   uuid;
  v_alloc     numeric;
  v_l         jsonb;
  v_existing  uuid;
  v_res_dup   jsonb;
  v_date      date;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Tarih verilmezse lab'ın yerel günü: CURRENT_DATE oturumun saat dilimindedir (UTC),
  -- TR'de 00:00–03:00 arası dünü verirdi.
  v_date := COALESCE(p_receipt_date, lab_today(v_lab));

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
  VALUES (v_lab, p_clinic_id, v_date, p_payment_method,
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
                                       v_base_ccy, v_date, p_payment_method);

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
END $function$;

CREATE OR REPLACE FUNCTION public.apply_clinic_credit(p_clinic_id uuid, p_receipt_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     uuid;
  v_r       RECORD;
  v_credit  numeric;
  v_applied numeric;
  v_total   numeric := 0;
  v_count   int := 0;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  FOR v_r IN
    SELECT id, receipt_date, payment_method, base_currency,
           total_base - allocated_base AS credit
      FROM clinic_receipts
     WHERE clinic_id = p_clinic_id
       AND total_base > allocated_base
       AND (p_receipt_id IS NULL OR id = p_receipt_id)
     ORDER BY receipt_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    v_credit := v_r.credit;
    CONTINUE WHEN v_credit <= 0;
    -- Ödeme tarihi lab'ın yerel günü (CURRENT_DATE UTC'dir; gece yarısından sonra dün olurdu).
    v_applied := alloc_receipt_to_invoices(v_r.id, p_clinic_id, v_credit,
                                           v_r.base_currency, lab_today(v_lab),
                                           v_r.payment_method);
    IF v_applied > 0 THEN
      UPDATE clinic_receipts
         SET allocated_base = allocated_base + v_applied, updated_at = now()
       WHERE id = v_r.id;
      v_total := v_total + v_applied;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied_base', v_total, 'receipts_touched', v_count);
END $function$;
