-- bulk_record_payment: ödeme satırına para birimi + kur yazılmıyordu.
--
-- payments.currency kolonunun varsayılanı 'TRY' olduğu için yabancı para
-- faturalarda payments_financial_guard "payment currency TRY <> invoice currency
-- EUR" hatası fırlatıyordu; TRY faturalarda da amount_base NULL kalıp raporları
-- bozuyordu. Düzeltme: değerler faturadan okunur.
--
-- Gövde, uygulama anındaki CANLI tanımdan alındı (scratch/bulk_before.sql).
-- Değişen tek yer: döngünün SELECT listesine currency/rate_at_time eklendi ve
-- INSERT bu alanları da yazıyor. Yetki kontrolü ve dağıtım sırası aynen korundu.

CREATE OR REPLACE FUNCTION public.bulk_record_payment(
  p_invoice_ids uuid[],
  p_total_amount numeric,
  p_payment_method text DEFAULT 'nakit'::text,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text
)
 RETURNS TABLE(invoice_id uuid, amount_paid numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row       RECORD;
  v_remaining NUMERIC := p_total_amount;
  v_to_pay    NUMERIC;
  v_lab_id    UUID := get_my_lab_id();
  v_base_ccy  TEXT;
BEGIN
  -- A: finance-role authorization (server-side; not UI)
  IF NOT (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                  AND ( p.user_type = 'admin'
                        OR (p.user_type = 'lab' AND p.role = ANY (ARRAY['manager','admin','accountant'])) ))
  ) THEN
    RAISE EXCEPTION 'unauthorized: finance role required to record payments' USING ERRCODE='42501';
  END IF;

  IF v_lab_id IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'unauthorized: no tenant context' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  FOR v_row IN
    SELECT i.id, (i.total - i.paid_amount) AS balance,
           i.currency, COALESCE(i.rate_at_time, 1) AS rate
      FROM invoices i
     WHERE i.id = ANY(p_invoice_ids)
       AND i.lab_id = v_lab_id
       AND i.status NOT IN ('odendi','iptal')
       AND (i.total - i.paid_amount) > 0
     ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_to_pay := LEAST(v_row.balance, v_remaining);
    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes,
                         received_by, currency, rate_at_time, amount_base, base_currency_at_time)
    VALUES (v_lab_id, v_row.id, v_to_pay, p_payment_date, p_payment_method, p_notes,
            auth.uid(), v_row.currency, v_row.rate,
            round(v_to_pay * v_row.rate, 2), v_base_ccy);
    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$function$;
