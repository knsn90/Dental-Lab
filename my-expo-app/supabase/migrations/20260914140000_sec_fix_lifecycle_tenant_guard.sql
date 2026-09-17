-- =====================================================================
-- STAGE 02.2-EMERGENCY — C-1 / C-2 (and cross-tenant work_orders equivalents)
-- CENTRAL tenant guard on order_stages + work_orders.
--
-- ROOT CAUSE: ~20 SECURITY DEFINER lifecycle RPCs (admin_complete/activate/skip_stage,
-- start/complete_stage_simple, force_activate_stage, approve_triage, pause/resume_stage,
-- transition_stage_state, override_stage_timing, request/reset_design_approval,
-- admin_force_design_approval, approve_order_cancellation, client_cancel_order,
-- archive/restore_order, replan_order, update_delivery_status, triage_order, ...) mutate
-- order_stages/work_orders but check only the CALLER'S OWN role (or nothing) and never bind
-- the TARGET to the caller's tenant. SECURITY DEFINER bypasses RLS, so a Lab-A manager
-- (or any authenticated user, for NULL-technician stages) can drive another lab's workflow
-- given a target UUID.
--
-- FIX (defense-in-depth, class-wide): a BEFORE INSERT/UPDATE/DELETE trigger that binds EVERY
-- order_stages / work_orders row mutation — direct PostgREST AND SECURITY DEFINER RPC — to a
-- caller who legitimately can access the parent work order. Because the guard reads auth.uid()
-- (the JWT sub, preserved inside SECURITY DEFINER), it catches the RPC bypass that RLS cannot.
--
-- INVARIANT: an authenticated user may only mutate order_stages / work_orders rows of work
-- orders they can access (same lab, the order's doctor, the order's clinic_admin, or platform
-- admin). Service/cron/magic-link contexts (no end-user JWT → auth.uid() IS NULL) are trusted
-- and rely on their own token/role checks (e.g. doctor_approve validates its magic-link token).
-- Belt-and-suspenders: anon EXECUTE is revoked from the lab-only stage RPCs (below) so an anon
-- caller cannot reach the auth.uid()-null path on those.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_lifecycle_tenant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_wo uuid;
BEGIN
  -- Trusted server context (edge service_role / cron / postgres / anon magic-link RPC):
  -- no end-user identity → per-function token/role checks are the boundary.
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_TABLE_NAME = 'order_stages' THEN
    v_wo := COALESCE(NEW.work_order_id, OLD.work_order_id);
  ELSE  -- work_orders
    v_wo := COALESCE(NEW.id, OLD.id);
  END IF;

  -- Authenticated user must legitimately access the parent work order.
  IF v_wo IS NOT NULL AND NOT can_access_work_order(v_wo) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emrinin yaşam döngüsüne erişim yok (%.%: %)',
      TG_TABLE_NAME, TG_OP, v_wo USING errcode = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS ztg_order_stages_tenant_guard ON public.order_stages;
CREATE TRIGGER ztg_order_stages_tenant_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lifecycle_tenant();

DROP TRIGGER IF EXISTS ztg_work_orders_tenant_guard ON public.work_orders;
CREATE TRIGGER ztg_work_orders_tenant_guard
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lifecycle_tenant();
-- NOTE: work_orders INSERT tenant binding is handled by the RLS INSERT-policy fix (C-3),
-- not here, because on INSERT the parent (self) doesn't exist yet and can_access would be moot.

-- Belt-and-suspenders least-privilege: anon may not invoke the lab-only stage RPCs.
-- (Magic-link / token RPCs such as doctor_approve, get_pending_approval KEEP anon EXECUTE.)
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'public.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.proname IN ('admin_complete_stage','admin_activate_stage','admin_skip_stage',
                        'approve_triage','force_activate_stage','complete_stage_simple',
                        'start_stage_simple','pause_stage','resume_stage','transition_stage_state',
                        'override_stage_timing','reject_stage','force_advance_stage',
                        'advance_to_next_stage','triage_order')
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM PUBLIC';
  END LOOP;
END $revoke$;

COMMIT;
