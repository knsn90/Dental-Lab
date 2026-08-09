-- ============================================================================
-- Envanter D3 (devam) — Doğrulama akışının RPC'leri
-- open → save_count → approve (ADJUST hareketleri) → close (kilit) / reopen
-- Okuma: list_inventory_verifications · get_verification_lines
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_inventory_verification(
  p_period_start date, p_period_end date, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid := public.get_my_lab_id(); v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'lab not resolved'; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_verifications
              WHERE lab_id = v_lab AND status = 'draft') THEN
    RAISE EXCEPTION 'Zaten acik bir dogrulama taslagi var — once onu tamamlayin';
  END IF;

  IF EXISTS (SELECT 1 FROM public.period_closures
              WHERE lab_id = v_lab AND reopened_at IS NULL
                AND p_period_start <= period_end AND p_period_end >= period_start) THEN
    RAISE EXCEPTION 'Bu tarih araligi kapali bir donemle cakisiyor';
  END IF;

  INSERT INTO public.inventory_verifications
    (lab_id, period_start, period_end, note, created_by)
  VALUES (v_lab, p_period_start, p_period_end, p_note, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.inventory_verification_lines
    (verification_id, stock_item_id, system_qty, unit, unit_cost_at_time, currency)
  SELECT v_id, si.id, COALESCE(si.quantity,0), si.unit, si.unit_cost,
         COALESCE(NULLIF(si.last_unit_cost_currency,''), NULLIF(si.default_purchase_currency,''),'TRY')
    FROM public.stock_items si
   WHERE si.lab_id = v_lab AND si.is_active;

  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.open_inventory_verification(date,date,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_verification_count(
  p_line_id uuid, p_physical_qty numeric, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid := public.get_my_lab_id(); v_status text;
BEGIN
  SELECT v.status INTO v_status
    FROM public.inventory_verification_lines l
    JOIN public.inventory_verifications v ON v.id = l.verification_id
   WHERE l.id = p_line_id AND v.lab_id = v_lab;
  IF v_status IS NULL THEN RAISE EXCEPTION 'line not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Yalniz taslak durumunda sayim girilebilir'; END IF;
  IF p_physical_qty IS NOT NULL AND p_physical_qty < 0 THEN
    RAISE EXCEPTION 'Fiziksel miktar negatif olamaz';
  END IF;

  UPDATE public.inventory_verification_lines
     SET physical_qty = p_physical_qty, note = COALESCE(p_note, note),
         counted_by = auth.uid(), counted_at = now()
   WHERE id = p_line_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.save_verification_count(uuid,numeric,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_inventory_verification(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id();
  v_status text; r record; v_diff numeric; v_rate numeric; v_base text;
  v_mv uuid; v_n int := 0; v_total numeric := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT status INTO v_status FROM public.inventory_verifications
   WHERE id = p_id AND lab_id = v_lab;
  IF v_status IS NULL THEN RAISE EXCEPTION 'verification not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Yalniz taslak onaylanabilir'; END IF;

  FOR r IN
    SELECT l.*, si.name AS item_name
      FROM public.inventory_verification_lines l
      JOIN public.stock_items si ON si.id = l.stock_item_id
     WHERE l.verification_id = p_id AND l.physical_qty IS NOT NULL
  LOOP
    v_diff := r.physical_qty - r.system_qty;
    CONTINUE WHEN v_diff = 0;

    SELECT gsr.rate, gsr.base_currency INTO v_rate, v_base
      FROM public.get_snapshot_rate(v_lab, COALESCE(r.currency,'TRY')) gsr;
    v_rate := COALESCE(v_rate,1); v_base := COALESCE(v_base,'TRY');

    INSERT INTO public.stock_movements (
      lab_id, item_id, item_name, type, quantity, unit,
      unit_cost_at_time, currency, rate_at_time, unit_cost_base_at_time,
      base_currency_at_time, total_cost_at_time, total_cost_base_at_time,
      note, source, user_id
    ) VALUES (
      v_lab, r.stock_item_id, r.item_name, 'ADJUST', v_diff, r.unit,
      COALESCE(r.unit_cost_at_time,0), COALESCE(r.currency,'TRY'), v_rate,
      COALESCE(r.unit_cost_at_time,0)*v_rate, v_base,
      v_diff*COALESCE(r.unit_cost_at_time,0), v_diff*COALESCE(r.unit_cost_at_time,0)*v_rate,
      format('Envanter dogrulama: sistem %s → sayim %s', r.system_qty, r.physical_qty),
      'inventory-verification', auth.uid()
    ) RETURNING id INTO v_mv;

    UPDATE public.inventory_verification_lines SET movement_id = v_mv WHERE id = r.id;
    v_n := v_n + 1;
    v_total := v_total + (v_diff * COALESCE(r.unit_cost_at_time,0) * v_rate);
  END LOOP;

  UPDATE public.inventory_verifications
     SET status = 'approved', approved_by = auth.uid(), approved_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('adjusted', v_n, 'cost_impact_base', round(v_total,2));
END; $function$;
GRANT EXECUTE ON FUNCTION public.approve_inventory_verification(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_inventory_period(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid := public.get_my_lab_id(); v record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v FROM public.inventory_verifications WHERE id = p_id AND lab_id = v_lab;
  IF v.id IS NULL THEN RAISE EXCEPTION 'verification not found'; END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'Once dogrulamayi onaylayin'; END IF;

  INSERT INTO public.period_closures
    (lab_id, period_start, period_end, verification_id, closed_by)
  VALUES (v_lab, v.period_start, v.period_end, p_id, auth.uid());

  UPDATE public.inventory_verifications
     SET status = 'closed', closed_by = auth.uid(), closed_at = now()
   WHERE id = p_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.close_inventory_period(uuid) TO authenticated, service_role;

-- Yeniden acma: yalniz admin + GEREKCE ZORUNLU
CREATE OR REPLACE FUNCTION public.reopen_inventory_period(p_closure_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid := public.get_my_lab_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role='admin')))
  THEN RAISE EXCEPTION 'forbidden — yalniz admin donem acabilir'; END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Gerekce zorunlu'; END IF;

  UPDATE public.period_closures
     SET reopened_at = now(), reopened_by = auth.uid(), reopen_reason = p_reason
   WHERE id = p_closure_id AND lab_id = v_lab AND reopened_at IS NULL;
END; $function$;
GRANT EXECUTE ON FUNCTION public.reopen_inventory_period(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_inventory_verifications(p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid, period_start date, period_end date, status text,
  line_count int, counted_count int, variance_count int,
  cost_impact numeric, created_at timestamptz, closure_id uuid, reopened boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT v.id, v.period_start, v.period_end, v.status,
    (SELECT count(*)::int FROM public.inventory_verification_lines l WHERE l.verification_id = v.id),
    (SELECT count(*)::int FROM public.inventory_verification_lines l
      WHERE l.verification_id = v.id AND l.physical_qty IS NOT NULL),
    (SELECT count(*)::int FROM public.inventory_verification_lines l
      WHERE l.verification_id = v.id AND l.physical_qty IS NOT NULL
        AND l.physical_qty <> l.system_qty),
    (SELECT COALESCE(round(sum((l.physical_qty - l.system_qty) * COALESCE(l.unit_cost_at_time,0)),2),0)
       FROM public.inventory_verification_lines l
      WHERE l.verification_id = v.id AND l.physical_qty IS NOT NULL),
    v.created_at,
    (SELECT pc.id FROM public.period_closures pc WHERE pc.verification_id = v.id LIMIT 1),
    (SELECT pc.reopened_at IS NOT NULL FROM public.period_closures pc WHERE pc.verification_id = v.id LIMIT 1)
  FROM public.inventory_verifications v
  WHERE v.lab_id = public.get_my_lab_id()
  ORDER BY v.created_at DESC
  LIMIT GREATEST(p_limit,1);
$function$;
GRANT EXECUTE ON FUNCTION public.list_inventory_verifications(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_verification_lines(p_verification_id uuid)
RETURNS TABLE (
  line_id uuid, stock_item_id uuid, item_name text, category text, barcode text,
  unit text, system_qty numeric, physical_qty numeric, diff numeric,
  unit_cost numeric, currency text, cost_impact numeric, counted boolean, note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT l.id, l.stock_item_id, si.name, si.category, si.barcode,
         l.unit, l.system_qty, l.physical_qty,
         CASE WHEN l.physical_qty IS NULL THEN NULL ELSE l.physical_qty - l.system_qty END,
         l.unit_cost_at_time, l.currency,
         CASE WHEN l.physical_qty IS NULL THEN NULL
              ELSE round((l.physical_qty - l.system_qty) * COALESCE(l.unit_cost_at_time,0), 2) END,
         l.physical_qty IS NOT NULL, l.note
    FROM public.inventory_verification_lines l
    JOIN public.inventory_verifications v ON v.id = l.verification_id
    JOIN public.stock_items si ON si.id = l.stock_item_id
   WHERE l.verification_id = p_verification_id
     AND v.lab_id = public.get_my_lab_id()
   ORDER BY (l.physical_qty IS NOT NULL), si.category NULLS LAST, si.name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_verification_lines(uuid) TO authenticated, service_role;
