-- Geri alma: 20261025161000 — calculate_order_profit 2026-10-25 canlı tanımı birebir.
CREATE OR REPLACE FUNCTION public.calculate_order_profit(p_work_order_id uuid)
 RETURNS TABLE(sale_price numeric, discount_amount numeric, net_revenue numeric, material_cost numeric, labor_cost numeric, logistics_cost numeric, overhead_cost numeric, total_cost numeric, profit numeric, margin_pct numeric, currency text, logistics_other jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab_id UUID; v_base TEXT; v_mat_ccy TEXT;
  v_sale NUMERIC := 0; v_discount NUMERIC := 0; v_net NUMERIC := 0;
  v_material NUMERIC := 0; v_labor NUMERIC := 0; v_logistics NUMERIC := 0;
  v_overhead NUMERIC := 0; v_other JSONB; v_total NUMERIC := 0;
BEGIN
  PERFORM assert_my_order(p_work_order_id);
  SELECT wo.lab_id, COALESCE(wo.sale_price,0), COALESCE(wo.discount_amount,0),
         COALESCE(wo.overhead_cost,0), wo.material_cost, wo.labor_cost,
         wo.material_cost_currency
    INTO v_lab_id, v_sale, v_discount, v_overhead, v_material, v_labor, v_mat_ccy
    FROM public.work_orders wo WHERE wo.id = p_work_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT ls.default_currency INTO v_base
    FROM public.lab_settings ls WHERE ls.lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  -- Onbellek yoksa VEYA baska bir para biriminde tutulmussa yeniden hesapla
  IF v_material IS NULL OR COALESCE(v_mat_ccy, v_base) <> v_base THEN
    SELECT COALESCE(SUM(
             public.fn_to_base(v_lab_id, COALESCE(sm.total_cost_at_time,0),
                               COALESCE(NULLIF(sm.currency,''), v_base),
                               sm.created_at::date)), 0)
      INTO v_material
      FROM public.stock_movements sm
     WHERE sm.order_id = p_work_order_id AND sm.type IN ('OUT','WASTE')
       AND COALESCE(sm.is_reversed,false) = false;
  END IF;

  IF v_labor IS NULL THEN
    SELECT COALESCE(SUM((COALESCE(os.active_work_seconds,0)/3600.0) * COALESCE(p.hourly_rate,0)),0)
      INTO v_labor
      FROM public.order_stages os
      LEFT JOIN public.profiles p ON p.id = os.technician_id
     WHERE os.work_order_id = p_work_order_id;
  END IF;

  SELECT COALESCE(SUM(d.fee_amount),0) INTO v_logistics
    FROM public.deliveries d
   WHERE d.work_order_id = p_work_order_id AND d.status <> 'iptal'
     AND d.fee_amount IS NOT NULL AND COALESCE(d.fee_currency, v_base) = v_base;

  SELECT jsonb_object_agg(t.cur, t.amt) INTO v_other
    FROM (SELECT d.fee_currency AS cur, SUM(d.fee_amount) AS amt
            FROM public.deliveries d
           WHERE d.work_order_id = p_work_order_id AND d.status <> 'iptal'
             AND d.fee_amount IS NOT NULL AND COALESCE(d.fee_currency, v_base) <> v_base
           GROUP BY d.fee_currency) t;

  v_material := COALESCE(v_material,0);
  v_labor    := COALESCE(v_labor,0);
  v_net      := v_sale - v_discount;
  v_total    := v_material + v_labor + v_logistics + v_overhead;

  RETURN QUERY SELECT v_sale, v_discount, v_net, v_material, v_labor, v_logistics,
    v_overhead, v_total, (v_net - v_total),
    CASE WHEN v_net > 0 THEN ROUND(((v_net - v_total)/v_net)*100,1) ELSE NULL END,
    v_base, COALESCE(v_other,'{}'::jsonb);
END;
$function$
;