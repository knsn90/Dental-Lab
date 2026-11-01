-- Geri alma: 20261026151000_karlilik_hekim_doviz
CREATE OR REPLACE FUNCTION public.profitability_by_doctor_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, currency text, revenue numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT wo.doctor_id, COALESCE(i.currency, 'TRY') AS currency, SUM(i.total) AS revenue
  FROM work_orders wo
  JOIN invoices i ON i.work_order_id = wo.id AND i.status <> 'iptal'
  WHERE wo.lab_id = p_lab_id
    AND public.can_view_lab_profit(p_lab_id)
    AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status <> 'iptal'
  GROUP BY wo.doctor_id, COALESCE(i.currency, 'TRY')
  HAVING SUM(i.total) <> 0;
$function$;
