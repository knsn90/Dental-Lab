-- ============================================================
-- 20260626 — profitability_top_orders: revenue_currency + revenue_original ekle
--
-- En Kârlı/Zararlı sipariş listesinde kârı siparişin KENDİ para biriminde
-- gösterebilmek için (₺ yerine €/$). by_doctor ile aynı mantık: sipariş tek
-- (TL dışı) dövizliyse currency + orijinal gelir döner. Mevcut sale_price/
-- profit/margin (baz ₺) korunur. Idempotent.
-- ============================================================
DROP FUNCTION IF EXISTS public.profitability_top_orders(uuid,integer,text,date,date);

CREATE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(id uuid, order_number text, patient_name text, doctor_name text, case_type text, sale_price numeric, total_cost numeric, profit numeric, margin_pct numeric, created_at timestamptz, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH oc AS (
    SELECT wo.id, wo.order_number, wo.patient_name, wo.doctor_id, wo.work_type, wo.created_at,
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost,
      (SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END
         FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal') AS rcur,
      COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal' AND i.currency<>'TRY'),0) AS rorig
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  )
  SELECT oc.id, oc.order_number, oc.patient_name, COALESCE(d.full_name, dr.full_name), oc.work_type,
    oc.revenue, oc.cost, oc.revenue - oc.cost,
    CASE WHEN oc.revenue>0 THEN ROUND(((oc.revenue-oc.cost)/oc.revenue)*100,1) ELSE 0 END, oc.created_at,
    oc.rcur, CASE WHEN oc.rcur IS NOT NULL THEN oc.rorig END
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
