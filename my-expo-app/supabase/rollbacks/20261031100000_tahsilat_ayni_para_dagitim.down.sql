-- Geri alma: 20261031100000_tahsilat_ayni_para_dagitim.sql → canlı ÖNCE hâli (bkz. .before.txt)

CREATE OR REPLACE FUNCTION public.alloc_receipt_to_invoices(p_receipt_id uuid, p_clinic_id uuid, p_base numeric, p_base_ccy text, p_date date, p_method text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(p_clinic_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

drop function if exists public._receipt_alloc_plan(uuid, jsonb, numeric);

-- 23fee05b makbuzu: ÖNCE hâli (2 ödeme, FTR-2026-00063 açık, allocated_base 294.63) — ödemeler birebir geri yazılır
delete from public.payments where receipt_id = '23fee05b-672b-46eb-9d74-cf4d9d6c4fc3';
insert into public.payments (id, lab_id, invoice_id, amount, payment_date, payment_method, reference_no, notes, received_by, created_at, currency, rate_at_time, amount_base, base_currency_at_time, idempotency_key, receipt_id) values ('2a7b24c5-06a6-49e1-95f0-ceb0a873176e', '243ef1db-9853-424b-8292-0025abfca436', 'bee48811-8a16-48c3-88fd-b63a663b1066', 6380.0, '2026-10-31', 'havale', null, null, 'f6817e96-2aab-443f-8cb3-02b7718f18e4', '2026-10-31T16:38:51.784464+00:00', 'TRY', 0.01796, 114.58, 'EUR', null, '23fee05b-672b-46eb-9d74-cf4d9d6c4fc3');
insert into public.payments (id, lab_id, invoice_id, amount, payment_date, payment_method, reference_no, notes, received_by, created_at, currency, rate_at_time, amount_base, base_currency_at_time, idempotency_key, receipt_id) values ('8b109441-4f60-4b9f-93a1-868697071137', '243ef1db-9853-424b-8292-0025abfca436', '2f4572ef-c6f3-424d-be02-2597c4906396', 8250.0, '2026-10-31', 'havale', null, null, 'f6817e96-2aab-443f-8cb3-02b7718f18e4', '2026-10-31T16:38:51.784464+00:00', 'TRY', 0.017986, 148.38, 'EUR', null, '23fee05b-672b-46eb-9d74-cf4d9d6c4fc3');
update public.clinic_receipts set allocated_base = 294.63 where id = '23fee05b-672b-46eb-9d74-cf4d9d6c4fc3';
