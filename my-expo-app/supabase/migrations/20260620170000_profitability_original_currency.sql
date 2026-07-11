-- Karlılıkta ₺ yanına orijinal döviz (€/$) göstermek için: faturalar TEK (baz
-- olmayan) para birimindeyse o para birimi (revenue_currency) + orijinal toplam
-- (revenue_original) da döner. Karışık/baz para → revenue_currency NULL (parantez yok).
DROP FUNCTION IF EXISTS public.profitability_summary(uuid,date,date);
DROP FUNCTION IF EXISTS public.profitability_by_doctor(uuid,date,date);

CREATE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_cur text; v_orig numeric;
BEGIN
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END,
         sum(i.total)
    INTO v_cur, v_orig
  FROM invoices i JOIN work_orders wo ON wo.id=i.work_order_id
  WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status<>'iptal' AND i.status<>'iptal';

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
    CASE WHEN SUM(revenue)>0 THEN ROUND((SUM(revenue-cost)/SUM(revenue))*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM op;
END;
$function$;

CREATE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
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
  ),
  cur AS (
    SELECT wo.doctor_id,
      CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END AS rcur,
      sum(i.total) AS rorig
    FROM work_orders wo JOIN invoices i ON i.work_order_id=wo.id AND i.status<>'iptal'
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status<>'iptal'
    GROUP BY wo.doctor_id
  )
  SELECT oc.doctor_id, COALESCE(d.full_name, dr.full_name, 'Bilinmeyen'), COUNT(*),
    COALESCE(SUM(oc.revenue),0), COALESCE(SUM(oc.cost),0), COALESCE(SUM(oc.revenue-oc.cost),0),
    CASE WHEN SUM(oc.revenue)>0 THEN ROUND((SUM(oc.revenue-oc.cost)/SUM(oc.revenue))*100,1) ELSE 0 END,
    max(cur.rcur), CASE WHEN max(cur.rcur) IS NOT NULL THEN max(cur.rorig) END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  LEFT JOIN cur ON cur.doctor_id=oc.doctor_id
  GROUP BY oc.doctor_id, d.full_name, dr.full_name
  HAVING SUM(oc.revenue) <> 0 OR SUM(oc.cost) <> 0
  ORDER BY 6 DESC;
END;
$function$;
