-- =====================================================================
-- STAGE 02.2-EMERGENCY — equivalent cross-tenant hole: create_delivery.
-- ROOT CAUSE: create_delivery (SECURITY DEFINER, manager-role gated) derives the delivery's
-- lab_id from the target work_order but never asserts the caller belongs to that lab, so a
-- Lab-A manager could create a delivery for a Lab-B order (proven).
-- FIX: BEFORE INSERT guard on deliveries binding the new row's lab_id to the caller's lab
-- (or platform admin). INSERT-only, so legitimate courier delivery-status UPDATEs are unaffected;
-- service/cron (auth.uid() null) is trusted.
-- =====================================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_delivery_insert_tenant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;                 -- service/cron
  IF NEW.lab_id IS NOT NULL
     AND NEW.lab_id <> get_my_lab_id()
     AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'yetkisiz: başka laboratuvar için teslimat oluşturulamaz' USING errcode = '42501';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS ztg_deliveries_tenant_guard ON public.deliveries;
CREATE TRIGGER ztg_deliveries_tenant_guard
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_insert_tenant();
COMMIT;
