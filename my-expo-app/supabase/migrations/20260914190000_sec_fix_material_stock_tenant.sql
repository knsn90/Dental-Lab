-- =====================================================================
-- STAGE 02.2-EMERGENCY (residual class) — cross-tenant material/stock mutation.
-- ROOT CAUSE: several SECURITY DEFINER material RPCs (confirm_stage_materials_v2,
-- mark_request_ordered/received, record_waste, admin_approve_request, admin_reject_request)
-- check only the CALLER'S role (admin / lab-manager) and never bind the target to the caller's
-- lab; SECURITY DEFINER bypasses the material tables' RLS. A Lab-A admin/manager could mutate
-- Lab-B stock/consumption/requests.
-- FIX: central BEFORE INSERT/UPDATE/DELETE lab_id guard on every material/stock table (each has
-- a lab_id column) — an authenticated caller may only touch rows of their own lab (NULL lab_id =
-- global rows allowed; platform admin exempt; service/cron auth.uid()-null trusted). Binds direct
-- PostgREST AND SECURITY DEFINER RPC mutations alike.
-- =====================================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_lab_id_tenant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_lab uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  v_lab := COALESCE(NEW.lab_id, OLD.lab_id);
  IF v_lab IS NOT NULL AND v_lab <> get_my_lab_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'yetkisiz: başka laboratuvarın kaydı (%.% lab=%)', TG_TABLE_NAME, TG_OP, v_lab
      USING errcode = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DO $apply$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_items','stock_movements','stock_locations','stage_material_selections',
                           'materials','production_materials','material_requests',
                           'material_request_catalog','consumption_profiles']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ztg_%s_tenant_guard ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER ztg_%s_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_lab_id_tenant()', t, t);
  END LOOP;
END $apply$;
COMMIT;
