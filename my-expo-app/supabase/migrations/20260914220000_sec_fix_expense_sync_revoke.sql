-- =====================================================================
-- STAGE 02.3-EMERGENCY — defense-in-depth least-privilege on the expense-sync
-- TRIGGER functions.
--
-- AUDIT RESULT (not a proven exploit): sync_advance_to_expense,
-- sync_purchase_invoice_to_expense and sync_salary_to_expense are SECURITY DEFINER
-- TRIGGER functions that were nonetheless granted EXECUTE to authenticated AND anon.
-- They are NOT directly exploitable — PostgreSQL refuses to run a trigger function
-- outside a trigger ('trigger functions can only be called as triggers', verified in
-- sandbox) — and their legitimate path derives lab_id from the parent row, whose
-- tables (employee_advances, purchase_invoices, salary_payments) are RLS-tenant-bound
-- (`lab_id = get_my_lab_id()` / tenant_guard). So no cross-tenant expense write is
-- possible through them.
--
-- Still, a trigger function should never carry a client-facing EXECUTE grant. Remove
-- the misleading anon/authenticated/PUBLIC grants (zero behavioural impact: triggers
-- fire regardless of these grants).
-- =====================================================================
BEGIN;

DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'public.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.proname IN ('sync_advance_to_expense',
                        'sync_purchase_invoice_to_expense',
                        'sync_salary_to_expense')
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM PUBLIC';
  END LOOP;
END $revoke$;

COMMIT;
