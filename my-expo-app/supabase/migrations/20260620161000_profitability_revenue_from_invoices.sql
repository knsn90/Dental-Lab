-- FIX: Karlılık hep 0 — gelir work_orders.sale_price'tan alınıyordu ama dolu değil.
-- Gerçek gelir siparişin FATURASINDA: gelir = siparişe bağlı iptal-olmayan faturaların
-- amount_base (baz ₺) toplamı → çok-para-birimi doğru (EUR €420 → ₺22.348). Maliyet
-- aynı (stock_movements.total_cost_at_time). Faturalanmamış sipariş → gelir 0.
-- top_orders/by_doctor geliri/maliyeti olmayan satırları gizler.

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH op AS (
    SELECT
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT COUNT(*), COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), 0::numeric, 0::numeric,
    COALESCE(SUM(cost),0), COALESCE(SUM(revenue-cost),0),
    CASE WHEN SUM(revenue)>0 THEN ROUND((SUM(revenue-cost)/SUM(revenue))*100,1) ELSE 0 END
  FROM op;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(id uuid, order_number text, patient_name text, doctor_name text, case_type text, sale_price numeric, total_cost numeric, profit numeric, margin_pct numeric, created_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.id, wo.order_number, wo.patient_name, wo.doctor_id, wo.work_type, wo.created_at,
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT oc.id, oc.order_number, oc.patient_name, COALESCE(d.full_name, dr.full_name), oc.work_type,
    oc.revenue, oc.cost, oc.revenue - oc.cost,
    CASE WHEN oc.revenue>0 THEN ROUND(((oc.revenue-oc.cost)/oc.revenue)*100,1) ELSE 0 END, oc.created_at
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  WHERE oc.revenue <> 0 OR oc.cost <> 0
  ORDER BY
    CASE WHEN p_order_by='best'  THEN oc.revenue-oc.cost END DESC NULLS LAST,
    CASE WHEN p_order_by='worst' THEN oc.revenue-oc.cost END ASC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.doctor_id,
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT oc.doctor_id, COALESCE(d.full_name, dr.full_name, 'Bilinmeyen'), COUNT(*),
    COALESCE(SUM(oc.revenue),0), COALESCE(SUM(oc.cost),0), COALESCE(SUM(oc.revenue-oc.cost),0),
    CASE WHEN SUM(oc.revenue)>0 THEN ROUND((SUM(oc.revenue-oc.cost)/SUM(oc.revenue))*100,1) ELSE 0 END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  GROUP BY oc.doctor_id, d.full_name, dr.full_name
  HAVING SUM(oc.revenue) <> 0 OR SUM(oc.cost) <> 0
  ORDER BY 6 DESC;
END;
$function$;
