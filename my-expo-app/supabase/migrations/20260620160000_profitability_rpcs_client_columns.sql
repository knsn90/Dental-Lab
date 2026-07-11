-- FIX: ProfitabilityScreen "Cannot read properties of undefined (reading
-- 'toLocaleString')" (DoctorRowView). RPC çıktı kolon adları client tipleriyle
-- uyuşmuyordu: by_doctor revenue/cost/margin_pct → total_revenue/total_cost/
-- avg_margin_pct; summary order_count → total_orders; top_orders order_id/revenue/
-- cost → id/sale_price/total_cost (+ patient_name, case_type, created_at).
-- Hesap mantığı aynı: gelir=sale_price, maliyet=stock_movements.total_cost_at_time,
-- status<>'iptal', doktor adı profiles+doctors. Return tipi değiştiği için DROP+CREATE.
DROP FUNCTION IF EXISTS public.profitability_summary(uuid,date,date);
DROP FUNCTION IF EXISTS public.profitability_top_orders(uuid,integer,text,date,date);
DROP FUNCTION IF EXISTS public.profitability_by_doctor(uuid,date,date);

CREATE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH op AS (
    SELECT COALESCE(wo.sale_price,0) AS revenue,
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

CREATE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(id uuid, order_number text, patient_name text, doctor_name text, case_type text, sale_price numeric, total_cost numeric, profit numeric, margin_pct numeric, created_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.id, wo.order_number, wo.patient_name, wo.doctor_id, wo.work_type, wo.created_at,
      COALESCE(wo.sale_price,0) AS revenue,
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
  ORDER BY
    CASE WHEN p_order_by='best'  THEN oc.revenue-oc.cost END DESC NULLS LAST,
    CASE WHEN p_order_by='worst' THEN oc.revenue-oc.cost END ASC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric)
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
  SELECT oc.doctor_id, COALESCE(d.full_name, dr.full_name, 'Bilinmeyen'), COUNT(*),
    COALESCE(SUM(oc.revenue),0), COALESCE(SUM(oc.cost),0), COALESCE(SUM(oc.revenue-oc.cost),0),
    CASE WHEN SUM(oc.revenue)>0 THEN ROUND((SUM(oc.revenue-oc.cost)/SUM(oc.revenue))*100,1) ELSE 0 END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  GROUP BY oc.doctor_id, d.full_name, dr.full_name
  ORDER BY 6 DESC;
END;
$function$;
