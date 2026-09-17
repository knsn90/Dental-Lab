-- =====================================================================
-- STAGE 02.3-EMERGENCY — C-1: cross-tenant / unauthenticated invoice forge
-- via create_invoice_from_order().
--
-- ROOT CAUSE: create_invoice_from_order(p_work_order_id) is SECURITY DEFINER
-- (bypasses RLS) with EXECUTE granted to BOTH authenticated AND anon. It derives
-- lab_id/doctor_id/clinic_id entirely from the attacker-supplied work order and
-- never verifies the caller may act on that work order's tenant. Proven: an anon
-- caller (no JWT) and a Lab-A manager both forged a 'taslak' invoice + invoice_items
-- into Lab-B's ledger; and because the fn early-returns any existing non-'iptal'
-- invoice, a forged draft pre-empts the victim lab's legitimate invoicing
-- (incl. the auto-draft-on-delivery trigger path).
--
-- FIX (mirrors the invoices INSERT RLS rule `lab_id = get_my_lab_id()`, so no new
-- business rule is introduced):
--   * an AUTHENTICATED caller may only create an invoice for a work order whose
--     lab is the caller's own lab (or the caller is a platform admin);
--   * auth.uid() IS NULL is the TRUSTED internal/service context (the auto-draft
--     trigger fired by a service-role / courier delivery, cron) — its own token/
--     role checks are the boundary there; and anon EXECUTE is REVOKED below so an
--     unauthenticated PostgREST caller can no longer reach the NULL path at all.
--
-- LEGIT PATHS PRESERVED:
--   - Auto-draft on delivery: when a lab manager delivers, auth.uid()=manager and
--     get_my_lab_id()=wo.lab_id → passes. When a service/courier context delivers,
--     auth.uid() IS NULL → trusted bypass. Either way the draft is still created.
--   - Manual lab-side creation (ClinicStatementScreen / InvoicesList / Denty), all
--     rendered only under (lab)/(admin) panels, runs as the lab user → passes.
--
-- INVARIANT: an invoice for a work order can be created only by the work order's own
-- lab (or platform admin), or by a trusted server/trigger context — never by an
-- unauthenticated caller and never across tenants.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_work_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
  v_base       TEXT;
  v_currency   TEXT;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id, wo.is_urgent
    INTO v_lab_id, v_doctor_id, v_clinic_id, v_is_urgent
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

  -- C-1 tenant guard: an authenticated caller must own the work order's lab
  -- (same rule as invoices_lab_insert RLS). NULL auth.uid() = trusted internal/
  -- service/trigger context (anon EXECUTE is revoked below, so anon cannot reach here).
  IF auth.uid() IS NOT NULL
     AND NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emri için fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  SELECT io.invoice_id INTO v_invoice_id
  FROM invoice_orders io
  JOIN invoices i ON i.id = io.invoice_id
  WHERE io.work_order_id = p_work_order_id AND i.status <> 'iptal'
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  v_due_date := CURRENT_DATE + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', CURRENT_DATE, v_due_date, v_currency, auth.uid())
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

  IF NOT EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_invoice_id) THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    SELECT v_invoice_id,
           COALESCE(work_type, 'Laboratuvar hizmeti') ||
             CASE
               WHEN tooth_numbers IS NOT NULL AND array_length(tooth_numbers, 1) > 0
               THEN ' (Dişler: ' || array_to_string(tooth_numbers, ', ') || ')'
               ELSE ''
             END,
           GREATEST(COALESCE(array_length(tooth_numbers, 1), 1), 1),
           0,
           1
    FROM work_orders WHERE id = p_work_order_id;
  END IF;

  IF v_is_urgent THEN
    SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
      FROM lab_settings WHERE lab_id = v_lab_id;
    IF v_rate > 0 THEN
      SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
        FROM invoice_items WHERE invoice_id = v_invoice_id;
      IF v_subtotal > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1,
                ROUND(v_subtotal * v_rate / 100.0, 2),
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$function$;

-- Least privilege: unauthenticated callers may not create invoices.
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_order(uuid) FROM PUBLIC;
-- authenticated keeps EXECUTE (guarded above); service_role/postgres unaffected.

COMMIT;
