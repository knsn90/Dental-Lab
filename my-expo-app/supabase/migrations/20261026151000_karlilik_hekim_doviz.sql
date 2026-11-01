-- 20261026151000_karlilik_hekim_doviz.sql
-- Tek tanım (Y2) Task 12 ek: hekim bazlı döviz kırılımı da FATURA tarihine göre (Karlılık ekranı
-- profitability_by_doctor ile yan yana okuyor; biri sipariş tarihinde kalırsa tablo tutmuyordu).
-- Geri alma: rollbacks/20261026151000_karlilik_hekim_doviz.down.sql

CREATE OR REPLACE FUNCTION public.profitability_by_doctor_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, currency text, revenue numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20261026151000: dönem = FATURA tarihi (profitability_by_doctor ile aynı kural); kesilmiş faturalar.
  SELECT wo.doctor_id, COALESCE(i.currency, 'TRY') AS currency, SUM(i.total) AS revenue
  FROM invoices i
  JOIN work_orders wo ON wo.id = i.work_order_id
  WHERE i.lab_id = p_lab_id
    AND public.can_view_lab_profit(p_lab_id)
    AND i.status IN ('kesildi','kismi_odendi','odendi')
    AND i.issue_date BETWEEN p_from AND p_to
  GROUP BY wo.doctor_id, COALESCE(i.currency, 'TRY')
  HAVING SUM(i.total) <> 0;
$function$;
