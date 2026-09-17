-- =====================================================================
-- STAGE 02.6-EMERGENCY — H-1: finance tables' RLS is role-blind (any lab member can
-- mutate financial records). Proven: a Lab-A technician deleted a payment + expense,
-- inserted an expense, and inflated their own approved payroll net_salary.
--
-- ROOT CAUSE: each finance table had a single PERMISSIVE `*_lab_own ALL (lab_id =
-- get_my_lab_id())` policy — lab-scoped but role-blind. RLS is the real boundary
-- (PostgREST honors the JWT, not the UI), so any lab role (technician) could write.
--
-- FIX (mirrors salary_adjustments RLS and refund_payment_intent, which gate on
-- has_permission('manage_finance')):
--   * READ (SELECT): `is_platform_admin() OR lab_id = get_my_lab_id()`  (lab members keep
--     read, incl. payroll/advance self-view; platform admin gains the read it needs).
--   * WRITE (INSERT/UPDATE/DELETE):
--       `is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))`
--     — platform admin is exempt from the lab match (their get_my_lab_id() is NULL);
--       otherwise the caller must be a finance-capable member of the row's own lab.
--   * payments: same write gate on INSERT/UPDATE/DELETE; SELECT policies untouched.
--
-- SCOPE: 11 tables. employee_advance_requests is INTENTIONALLY left lab-open — its INSERT
-- is legitimate employee self-service (advance-requests/api.ts) and it is a request queue,
-- not money; the money table (employee_advances) IS gated here, so approval-into-money
-- still requires finance.
--
-- NOT AFFECTED: SECURITY DEFINER finance RPCs run as definer and bypass RLS. Cross-tenant
-- stays blocked (lab_id scope). PREREQ (already true in production): role_permissions
-- seeded (lab_manager → manage_finance); this migration is policy-only.
--
-- Idempotent: drops both the original role-blind ALL policy and any policy names this
-- migration creates, then recreates them.
--
-- INVARIANT: financial records may be written only by a finance-capable member of the
-- row's lab, or a platform admin; any lab member may still read.
-- =====================================================================
BEGIN;

DO $mig$
DECLARE t text; polname text;
  tbls text[] := ARRAY[
    'expenses','employee_payroll','salary_payments','employee_advances',
    'payroll_items','performance_bonuses','recurring_expenses','checks','budgets'];
  wr  text := '(is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission(''manage_finance'')))';
  rd  text := '(is_platform_admin() OR lab_id = get_my_lab_id())';
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- drop any prior policies from this migration (idempotent re-run)
    FOR polname IN SELECT unnest(ARRAY[t||'_read', t||'_fin_ins', t||'_fin_upd', t||'_fin_del']) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, t);
    END LOOP;
    -- drop the original role-blind ALL policy (name varies per table)
    FOR polname IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='ALL'
        AND coalesce(qual,'') ~ 'get_my_lab_id'
        AND coalesce(qual,'') !~* 'manage_finance|user_type|is_platform_admin|role'
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', polname, t); END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s)', t||'_read', t, rd);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)', t||'_fin_ins', t, wr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t||'_fin_upd', t, wr, wr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (%s)', t||'_fin_del', t, wr);
  END LOOP;
END $mig$;

-- purchase_invoice_extras: keep existing SELECT read policy; gate writes.
DROP POLICY IF EXISTS "lab writes own invoice extras" ON public.purchase_invoice_extras;
DROP POLICY IF EXISTS pie_fin_ins ON public.purchase_invoice_extras;
DROP POLICY IF EXISTS pie_fin_upd ON public.purchase_invoice_extras;
DROP POLICY IF EXISTS pie_fin_del ON public.purchase_invoice_extras;
CREATE POLICY pie_fin_ins ON public.purchase_invoice_extras FOR INSERT
  WITH CHECK (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));
CREATE POLICY pie_fin_upd ON public.purchase_invoice_extras FOR UPDATE
  USING (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')))
  WITH CHECK (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));
CREATE POLICY pie_fin_del ON public.purchase_invoice_extras FOR DELETE
  USING (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));

-- payments: finance-gate the write policies; leave SELECT policies intact.
DROP POLICY IF EXISTS payments_lab_insert ON public.payments;
CREATE POLICY payments_lab_insert ON public.payments FOR INSERT
  WITH CHECK (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));
DROP POLICY IF EXISTS payments_lab_update ON public.payments;
CREATE POLICY payments_lab_update ON public.payments FOR UPDATE
  USING (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')))
  WITH CHECK (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));
DROP POLICY IF EXISTS payments_lab_delete ON public.payments;
CREATE POLICY payments_lab_delete ON public.payments FOR DELETE
  USING (is_platform_admin() OR (lab_id = get_my_lab_id() AND has_permission('manage_finance')));

COMMIT;
