-- =====================================================================
-- STAGE 01.14 — PAYMENT HARDENING (supplemental to 01.10.1)
--   H-01: bulk_record_payment double-accounting (same M-01 pattern)
--   H-02: confirm_payment_intent expires_at enforcement
-- Sandbox only. No production.
-- =====================================================================
BEGIN;

-- H-01: bulk_record_payment — remove the explicit paid_amount/status UPDATE.
-- The payments AFTER trigger (recalc_invoice_payment_state = SUM(payments)) is
-- the single writer of invoices.paid_amount/status. Currency defaults to the
-- invoice currency and overpay is blocked by payments_financial_guard.
CREATE OR REPLACE FUNCTION public.bulk_record_payment(
  p_invoice_ids uuid[], p_total_amount numeric, p_payment_method text DEFAULT 'nakit',
  p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL)
RETURNS TABLE(invoice_id uuid, amount_paid numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row       RECORD;
  v_remaining NUMERIC := p_total_amount;
  v_to_pay    NUMERIC;
  v_lab_id    UUID := get_my_lab_id();
BEGIN
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no tenant context' USING ERRCODE='42501';
  END IF;
  FOR v_row IN
    SELECT i.id, (i.total - i.paid_amount) AS balance
      FROM invoices i
     WHERE i.id = ANY(p_invoice_ids)
       AND i.lab_id = v_lab_id
       AND i.status NOT IN ('odendi','iptal')
       AND (i.total - i.paid_amount) > 0
     ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_to_pay := LEAST(v_row.balance, v_remaining);

    -- INSERT only. The AFTER trigger recomputes paid_amount = SUM(payments)
    -- and the invoice status. No explicit invoice UPDATE here (avoids double count).
    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes, received_by)
    VALUES (v_lab_id, v_row.id, v_to_pay, p_payment_date, p_payment_method, p_notes, auth.uid());

    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- H-02: confirm_payment_intent — enforce expires_at (server-side).
-- expires_at is NOT NULL in schema (default now()+7d); NULL (if ever) = never expires.
CREATE OR REPLACE FUNCTION public.confirm_payment_intent(p_intent_id uuid, p_provider_ref text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_intent     RECORD;
  v_inv_ccy    text;
  v_payment_id uuid;
  v_idem       text := 'intent:' || p_intent_id::text;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent bulunamadı: %', p_intent_id;
  END IF;

  IF v_intent.status = 'paid' THEN
    SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
    RETURN COALESCE(v_payment_id, v_intent.id);
  END IF;

  IF v_intent.status NOT IN ('pending','awaiting_3ds','authorized') THEN
    RAISE EXCEPTION 'illegal payment_intent transition: % -> paid', v_intent.status USING ERRCODE='22023';
  END IF;

  -- H-02: expired intents cannot be confirmed (even with a valid provider signature/replay)
  IF v_intent.expires_at IS NOT NULL AND v_intent.expires_at <= now() THEN
    RAISE EXCEPTION 'payment_intent expired at %', v_intent.expires_at USING ERRCODE='22023';
  END IF;

  SELECT currency INTO v_inv_ccy FROM invoices WHERE id = v_intent.invoice_id;

  INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method, payment_date, notes, idempotency_key)
  VALUES (v_intent.lab_id, v_intent.invoice_id, v_intent.amount,
          COALESCE(v_inv_ccy, v_intent.currency),
          'kart', CURRENT_DATE,
          'Online ödeme · ' || v_intent.provider || COALESCE(' · ref:' || p_provider_ref, ''),
          v_idem)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
  END IF;

  UPDATE payment_intents
     SET status='paid', paid_at=now(), provider_ref=COALESCE(p_provider_ref, provider_ref), updated_at=now()
   WHERE id = p_intent_id;

  RETURN v_payment_id;
END;
$function$;

COMMIT;
