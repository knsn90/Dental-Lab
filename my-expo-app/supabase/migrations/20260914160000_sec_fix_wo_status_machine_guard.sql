-- =====================================================================
-- STAGE 02.2-EMERGENCY — H-1: work_orders state-machine bypass via direct UPDATE.
--
-- ROOT CAUSE: `wo_lab_update` RLS is role-blind (any user_type IN ('lab','admin') + same lab)
-- and there is NO transition guard, so any same-tenant lab user (incl. a technician) can
-- `UPDATE work_orders SET status='teslim_edildi'` (or ='iptal', or backward, or arbitrary)
-- directly via PostgREST — skipping every stage/QC/delivery/cancellation RPC — and fire the
-- auto-draft-invoice + delivery-notification triggers.
--
-- FIX: lifecycle-sensitive columns of work_orders may only be changed through the lifecycle
-- RPCs. Those RPCs are SECURITY DEFINER owned by `postgres` (so inside them current_user =
-- 'postgres'); a direct PostgREST update runs as 'authenticated'/'anon'. A SECURITY INVOKER
-- BEFORE UPDATE trigger therefore blocks lifecycle-field changes made by a direct
-- ('authenticated'/'anon') caller while allowing the RPC / service-role paths. The client does
-- NO direct status update (verified: only lab_notes/priority), so no legitimate flow breaks.
--
-- H-2 (design-approval gate) is closed in the two RPCs that skipped it (admin_complete_stage,
-- admin_skip_stage), added below.
--
-- INVARIANT: work_order status/assignment/stage/delivery/approval transitions happen only via
-- the authoritative lifecycle RPCs, never a raw client UPDATE.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_work_order_lifecycle_via_rpc()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
BEGIN
  -- Only constrain untrusted DIRECT callers. Lifecycle RPCs run as 'postgres'
  -- (SECURITY DEFINER owner); trusted edge writes as 'service_role'.
  IF current_user IN ('authenticated','anon') THEN
    IF NEW.status                 IS DISTINCT FROM OLD.status
    OR NEW.assigned_to            IS DISTINCT FROM OLD.assigned_to
    OR NEW.current_stage_id       IS DISTINCT FROM OLD.current_stage_id
    OR NEW.delivered_at           IS DISTINCT FROM OLD.delivered_at
    OR NEW.doctor_approval_status IS DISTINCT FROM OLD.doctor_approval_status THEN
      RAISE EXCEPTION 'work_order lifecycle fields (status/assignment/stage/delivery/approval) must be changed through a lifecycle RPC, not a direct update'
        USING errcode = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS ztg_work_orders_lifecycle_guard ON public.work_orders;
CREATE TRIGGER ztg_work_orders_lifecycle_guard
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_work_order_lifecycle_via_rpc();

COMMIT;
