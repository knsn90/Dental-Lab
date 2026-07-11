-- FIX: Karlılık sayfası çalışmıyordu (sonsuz yükleniyor).
-- Profitability/usage/waste RPC'leri eski şemaya göre yazılmıştı:
--   * wo.price  → work_orders'ta yok (doğrusu wo.sale_price)
--   * si.id::TEXT = sm.item_id → text=uuid (artık ikisi de uuid)
--   * si.unit_price → stock_items'ta yok
--   * status='cancelled' → TR şemada 'iptal'
-- Maliyet artık stock_movements.total_cost_at_time (tüketim anı maliyeti) ile
-- hesaplanıyor; stock_items join'i gereksiz kaldırıldı.
-- profitability_top_orders / by_doctor doktor adını profiles+doctors'tan çözer.

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, order_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH order_profits AS (
    SELECT
      COALESCE(wo.sale_price, 0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id = wo.id AND sm.type IN ('OUT','WASTE')), 0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id = p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT COALESCE(SUM(op.revenue),0), COALESCE(SUM(op.cost),0), COALESCE(SUM(op.revenue-op.cost),0),
    CASE WHEN SUM(op.revenue)>0 THEN ROUND((SUM(op.revenue-op.cost)/SUM(op.revenue))*100,1) ELSE 0 END, COUNT(*)
  FROM order_profits op;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(order_id uuid, order_number text, doctor_name text, revenue numeric, cost numeric, profit numeric, margin_pct numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.id, wo.order_number, wo.doctor_id,
      COALESCE(wo.sale_price,0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT oc.id, oc.order_number, COALESCE(d.full_name, dr.full_name), oc.revenue, oc.cost,
    oc.revenue - oc.cost,
    CASE WHEN oc.revenue>0 THEN ROUND(((oc.revenue-oc.cost)/oc.revenue)*100,1) ELSE 0 END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  ORDER BY
    CASE WHEN p_order_by='best'  THEN oc.revenue-oc.cost END DESC NULLS LAST,
    CASE WHEN p_order_by='worst' THEN oc.revenue-oc.cost END ASC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, revenue numeric, cost numeric, profit numeric, margin_pct numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.doctor_id,
      COALESCE(wo.sale_price,0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT oc.doctor_id, COALESCE(d.full_name, dr.full_name), COUNT(*),
    COALESCE(SUM(oc.revenue),0), COALESCE(SUM(oc.cost),0), COALESCE(SUM(oc.revenue-oc.cost),0),
    CASE WHEN SUM(oc.revenue)>0 THEN ROUND((SUM(oc.revenue-oc.cost)/SUM(oc.revenue))*100,1) ELSE 0 END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  GROUP BY oc.doctor_id, d.full_name, dr.full_name
  ORDER BY 6 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_technician_usage(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(user_id uuid, full_name text, total_items bigint, total_quantity numeric, total_cost numeric, waste_quantity numeric, waste_cost numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT sm.user_id, p.full_name, COUNT(*),
    SUM(sm.quantity),
    SUM(COALESCE(sm.total_cost_at_time,0)),
    SUM(CASE WHEN sm.type='WASTE' THEN sm.quantity ELSE 0 END),
    SUM(CASE WHEN sm.type='WASTE' THEN COALESCE(sm.total_cost_at_time,0) ELSE 0 END)
  FROM stock_movements sm
  JOIN profiles p ON p.id = sm.user_id
  WHERE sm.type IN ('OUT','WASTE') AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND EXISTS (SELECT 1 FROM profiles pp WHERE pp.id = sm.user_id AND pp.lab_id = p_lab_id)
  GROUP BY sm.user_id, p.full_name
  ORDER BY 5 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_material_waste(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(material_id uuid, material_name text, waste_quantity numeric, waste_cost numeric, waste_events bigint, unit text)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT si.id, si.name, SUM(sm.quantity), SUM(COALESCE(sm.total_cost_at_time,0)), COUNT(*), si.unit
  FROM stock_movements sm
  JOIN stock_items si ON si.id = sm.item_id
  WHERE sm.type='WASTE' AND sm.created_at::DATE BETWEEN p_from AND p_to AND si.lab_id = p_lab_id
  GROUP BY si.id, si.name, si.unit
  ORDER BY 4 DESC;
END;
$function$;
