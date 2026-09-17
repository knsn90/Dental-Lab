-- =====================================================================
-- STAGE 02.5-EMERGENCY — H-1 + M-2: cross-tenant delivery manipulation.
--
-- ROOT CAUSE: the 02.2 delivery guard was INSERT-only; `deliveries` RLS is bypassed by
-- SECURITY DEFINER RPCs; and update_delivery_status / set_delivery_fee authorize on role
-- only (update_delivery_status not at all on tenant; set_delivery_fee skips the check for
-- user_type='admin'). A Lab-A manager could UPDATE any lab's delivery (proven: cancelled a
-- Lab-B delivery).
--
-- FIX (02.2 central-guard pattern):
--   1. enforce_delivery_tenant() BEFORE INSERT OR UPDATE OR DELETE on deliveries — binds
--      every delivery-row mutation (direct AND SECDEF-RPC) to: platform admin, OR the row's
--      own lab (get_my_lab_id), OR the assigned courier (courier_id = auth.uid()).
--      auth.uid() IS NULL = trusted service (BanaBiKurye webhook / service_role / cron).
--   2. update_delivery_status: bind the caller to the delivery's lab (or courier / platform admin).
--   3. set_delivery_fee: apply the lab-tenant check to ALL callers (incl. user_type='admin').
--
-- LEGIT PATHS PRESERVED: courier self-updates (courier_id=auth.uid), lab manager on own-lab
-- deliveries, service webhook/cron (auth.uid NULL), platform admin. The teslim_edildi path
-- that also updates work_orders remains subject to the 02.2 lifecycle guard.
--
-- INVARIANT: a delivery row may be created/updated/deleted only by its own lab (or platform
-- admin), the assigned courier, or a trusted server context — never cross-tenant.
-- =====================================================================
BEGIN;

-- 1. Central tenant guard (supersedes the INSERT-only guard).
CREATE OR REPLACE FUNCTION public.enforce_delivery_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lab uuid; v_courier uuid;
BEGIN
  -- trusted server context (edge webhook / service_role / cron): no end-user identity
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF is_platform_admin() THEN RETURN COALESCE(NEW, OLD); END IF;

  v_lab     := COALESCE(NEW.lab_id, OLD.lab_id);
  v_courier := COALESCE(NEW.courier_id, OLD.courier_id);

  IF v_lab IS NOT NULL AND v_lab = get_my_lab_id() THEN
    RETURN COALESCE(NEW, OLD);                          -- own-lab user
  END IF;
  IF v_courier IS NOT NULL AND v_courier = auth.uid() THEN
    RETURN COALESCE(NEW, OLD);                          -- assigned courier
  END IF;

  RAISE EXCEPTION 'yetkisiz: bu teslimat kaydına erişim yok (%.%)', TG_TABLE_NAME, TG_OP
    USING errcode = '42501';
END $function$;

DROP TRIGGER IF EXISTS ztg_deliveries_tenant_guard ON public.deliveries;
CREATE TRIGGER ztg_deliveries_tenant_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_tenant();

-- retire the old INSERT-only guard function (replaced above)
DROP FUNCTION IF EXISTS public.enforce_delivery_insert_tenant() CASCADE;

-- 2. update_delivery_status: bind caller to the delivery's tenant (defense-in-depth).
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_delivery_id uuid, p_status delivery_status, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_courier   UUID;
  v_wo        UUID;
  v_dir       TEXT;
  v_purpose   TEXT;
  v_lab       UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT courier_id, work_order_id, direction, purpose, lab_id
    INTO v_courier, v_wo, v_dir, v_purpose, v_lab
    FROM public.deliveries WHERE id = p_delivery_id;
  IF v_wo IS NULL THEN RAISE EXCEPTION 'delivery not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  -- role AND tenant: platform admin, OR own-lab manager/admin, OR the assigned courier
  IF NOT (
    is_platform_admin()
    OR (v_lab = get_my_lab_id()
        AND (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))))
    OR v_caller = v_courier
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE public.deliveries
     SET status        = p_status,
         picked_up_at  = CASE WHEN p_status = 'teslim_alindi' AND picked_up_at IS NULL THEN NOW() ELSE picked_up_at END,
         delivered_at  = CASE WHEN p_status = 'teslim_edildi' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
         cancelled_at  = CASE WHEN p_status = 'iptal'         AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
         cancel_reason = CASE WHEN p_status = 'iptal' THEN COALESCE(p_note, cancel_reason) ELSE cancel_reason END,
         notes         = CASE WHEN p_note IS NOT NULL AND p_status <> 'iptal' THEN p_note ELSE notes END
   WHERE id = p_delivery_id;

  IF p_status = 'teslim_edildi'
     AND COALESCE(v_dir, 'lab_to_clinic') = 'lab_to_clinic'
     AND COALESCE(v_purpose, 'teslimat') = 'teslimat' THEN
    UPDATE public.work_orders SET
        status           = 'teslim_edildi',
        delivered_at     = COALESCE(delivered_at, NOW()),
        hold_status      = NULL, hold_reason = NULL, hold_category = NULL,
        hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
     WHERE id = v_wo
       AND status IN ('kuryede', 'kurye_bekleniyor', 'teslimata_hazir');
  END IF;

  RETURN TRUE;
END;
$function$;

-- 3. set_delivery_fee: apply the lab-tenant check to every caller (incl. user_type='admin').
CREATE OR REPLACE FUNCTION public.set_delivery_fee(p_delivery_id uuid, p_amount numeric, p_currency text DEFAULT NULL::text, p_source text DEFAULT 'manuel'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_currency  TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.deliveries WHERE id = p_delivery_id;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'delivery not found'; END IF;

  -- 02.5 tenant bind: applies to lab AND admin user types (platform admin exempt)
  IF NOT (is_platform_admin() OR v_lab_id = get_my_lab_id()) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'fee must be >= 0';
  END IF;

  v_currency := p_currency;
  IF v_currency IS NULL AND p_amount IS NOT NULL THEN
    SELECT default_currency INTO v_currency FROM public.lab_settings WHERE lab_id = v_lab_id;
    v_currency := COALESCE(v_currency, 'TRY');
  END IF;

  UPDATE public.deliveries
     SET fee_amount   = p_amount,
         fee_currency = CASE WHEN p_amount IS NULL THEN NULL ELSE v_currency END,
         fee_source   = CASE WHEN p_amount IS NULL THEN NULL ELSE COALESCE(p_source, 'manuel') END
   WHERE id = p_delivery_id;

  RETURN TRUE;
END;
$function$;

COMMIT;
