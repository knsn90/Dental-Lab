-- =====================================================================
-- STAGE 01.10.1 — MONEY INTEGRITY REMEDIATION (DB-enforced)
-- M-01 double accounting · M-02 concurrency/idempotency · M-03 forged total
-- M-04 overpay/idempotency · M-05 currency mismatch · M-06 invoice uniqueness
-- Develop/test in disposable sandbox ONLY. No production.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- M-04/M-02: payments idempotency key (business identity) + partial UNIQUE
-- ---------------------------------------------------------------------
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_idempotency
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- M-05 + M-04(overpay) + M-02(serialize): payments guard (BEFORE INSERT/UPDATE)
--   * locks the invoice row FOR UPDATE  -> serializes concurrent payments
--   * enforces payment.currency = invoice.currency
--   * enforces SUM(payments)+NEW.amount <= invoice.total  (no overpay)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payments_financial_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_inv RECORD; v_sum numeric;
BEGIN
  -- lock the invoice row: serializes concurrent payments to the same invoice
  SELECT id, currency, total, status INTO v_inv
    FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment: invoice % not found', NEW.invoice_id USING ERRCODE='23503';
  END IF;

  -- M-05: currency must match the invoice
  IF NEW.currency IS NULL THEN NEW.currency := v_inv.currency; END IF;
  IF NEW.currency IS DISTINCT FROM v_inv.currency THEN
    RAISE EXCEPTION 'payment currency % <> invoice currency %', NEW.currency, v_inv.currency USING ERRCODE='22023';
  END IF;

  -- M-04: no overpay (SUM of OTHER payments + this one must be <= total)
  SELECT COALESCE(SUM(amount),0) INTO v_sum
    FROM payments WHERE invoice_id = NEW.invoice_id
      AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
  IF v_sum + NEW.amount > v_inv.total AND v_inv.total > 0 THEN
    RAISE EXCEPTION 'overpay blocked: paid % + % > invoice total %', v_sum, NEW.amount, v_inv.total USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_payments_financial_guard ON public.payments;
CREATE TRIGGER trg_payments_financial_guard
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_financial_guard();

-- ---------------------------------------------------------------------
-- M-01 + M-02: confirm_payment_intent — single source of truth + lock + idempotency
--   * SELECT ... FOR UPDATE on the intent (serialize concurrent confirms)
--   * legal-transition guard
--   * insert exactly one payment with idempotency_key='intent:'||id
--   * DO NOT touch invoices.paid_amount here — the payments AFTER trigger
--     (recalc_invoice_payment_state = SUM(payments)) is the ONLY writer.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_payment_intent(p_intent_id uuid, p_provider_ref text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_intent     RECORD;
  v_inv_ccy    text;
  v_payment_id uuid;
  v_idem       text := 'intent:' || p_intent_id::text;
BEGIN
  -- serialize competing confirmations for the same intent
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent bulunamadı: %', p_intent_id;
  END IF;

  -- idempotent: already paid → return the existing payment (if any)
  IF v_intent.status = 'paid' THEN
    SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
    RETURN COALESCE(v_payment_id, v_intent.id);
  END IF;

  -- legal transition guard: only confirmable from these states
  IF v_intent.status NOT IN ('pending','awaiting_3ds','authorized') THEN
    RAISE EXCEPTION 'illegal payment_intent transition: % -> paid', v_intent.status USING ERRCODE='22023';
  END IF;

  SELECT currency INTO v_inv_ccy FROM invoices WHERE id = v_intent.invoice_id;

  -- exactly one payment; idempotency key is the DB backstop against replay
  INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method, payment_date, notes, idempotency_key)
  VALUES (v_intent.lab_id, v_intent.invoice_id, v_intent.amount,
          COALESCE(v_inv_ccy, v_intent.currency),
          'kart', CURRENT_DATE,
          'Online ödeme · ' || v_intent.provider || COALESCE(' · ref:' || p_provider_ref, ''),
          v_idem)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_payment_id;

  -- if a concurrent/replayed confirm already inserted it, reuse that row
  IF v_payment_id IS NULL THEN
    SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
  END IF;

  -- mark intent paid (paid_amount/status on the invoice is owned by the payments trigger)
  UPDATE payment_intents
     SET status='paid', paid_at=now(), provider_ref=COALESCE(p_provider_ref, provider_ref), updated_at=now()
   WHERE id = p_intent_id;

  RETURN v_payment_id;
END;
$fn$;

-- ---------------------------------------------------------------------
-- M-03: invoices.total is authoritative when the invoice has line items.
--   BEFORE UPDATE: recompute subtotal/tax/total from items + tax_rate,
--   overriding any client-supplied values. (Item-less manual invoices keep
--   their typed total.) Runs first (name sorts before other BEFORE triggers).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aa_enforce_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_sub numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = NEW.id) THEN
    -- item-based invoice: total/subtotal/tax are DERIVED (client input ignored)
    SELECT COALESCE(SUM(net_total),0) INTO v_sub FROM invoice_items WHERE invoice_id = NEW.id;
    NEW.subtotal   := v_sub;
    NEW.tax_amount := ROUND(v_sub * COALESCE(NEW.tax_rate,0) / 100, 2);
    NEW.total      := NEW.subtotal + NEW.tax_amount;
  ELSE
    -- item-less (manual) invoice: financial columns are FROZEN after creation
    NEW.subtotal   := OLD.subtotal;
    NEW.tax_amount := OLD.tax_amount;
    NEW.total      := OLD.total;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS aa_enforce_invoice_totals ON public.invoices;
CREATE TRIGGER aa_enforce_invoice_totals
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.aa_enforce_invoice_totals();

-- ---------------------------------------------------------------------
-- M-06: one ACTIVE (non-iptal) invoice per work_order.
--   BEFORE INSERT on invoice_orders: reject linking a work_order that already
--   has a non-cancelled invoice. Re-invoicing after cancellation is allowed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_orders_one_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoice_orders io JOIN invoices i ON i.id = io.invoice_id
    WHERE io.work_order_id = NEW.work_order_id AND i.status <> 'iptal'
      AND io.invoice_id <> NEW.invoice_id
  ) THEN
    RAISE EXCEPTION 'work_order % already has an active invoice', NEW.work_order_id USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_invoice_orders_one_active ON public.invoice_orders;
CREATE TRIGGER trg_invoice_orders_one_active
  BEFORE INSERT ON public.invoice_orders
  FOR EACH ROW EXECUTE FUNCTION public.invoice_orders_one_active();

COMMIT;
