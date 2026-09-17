-- =====================================================================
-- STAGE 01.15 — PAYMENT AUTHORIZATION HARDENING (supplemental to 01.14)
--   A: finance-role gate on bulk_record_payment
--   B: revoke anon (and PUBLIC) EXECUTE on bulk_record_payment
--   C: central payment activity_log event (reuse canonical log_activity)
-- Sandbox only. No production.
-- =====================================================================
BEGIN;

-- Canonical finance-capable predicate (matches purchase_invoices / currency_rates /
-- material_request_catalog write policies): platform admin, OR user_type='admin',
-- OR (user_type='lab' AND role IN manager/admin/accountant). Same-lab enforced by
-- the existing get_my_lab_id() filter inside the function.
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
    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes, received_by)
    VALUES (v_lab_id, v_row.id, v_to_pay, p_payment_date, p_payment_method, p_notes, auth.uid());
    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- B: least privilege — anon/PUBLIC may not record payments
REVOKE EXECUTE ON FUNCTION public.bulk_record_payment(uuid[],numeric,text,date,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_record_payment(uuid[],numeric,text,date,text) FROM PUBLIC;
-- authenticated keeps EXECUTE; the finance-role gate inside enforces authorization.

-- C: central payment audit event via canonical log_activity (all payment paths)
CREATE OR REPLACE FUNCTION public.trg_log_payment_recorded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  PERFORM public.log_activity(
    'payment_recorded', 'payment', NEW.id,
    NEW.payment_method || ' ' || NEW.amount::text || ' ' || COALESCE(NEW.currency,''),
    jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount,
                       'currency', NEW.currency, 'method', NEW.payment_method,
                       'payment_date', NEW.payment_date),
    NEW.lab_id, COALESCE(NEW.received_by, auth.uid()));
  RETURN NEW;   -- log_activity swallows its own errors; cannot break the payment
END;
$fn$;
DROP TRIGGER IF EXISTS trg_log_payment_recorded ON public.payments;
CREATE TRIGGER trg_log_payment_recorded
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_payment_recorded();

COMMIT;
