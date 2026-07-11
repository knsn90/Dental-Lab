-- ============================================================
-- 20260625 — profitability_by_doctor_revenue_ccy
--
-- Kâr-Zarar ekranı doktor satırlarında geliri KATI per-currency göstermek için.
-- Mevcut profitability_by_doctor geliri base'e (amount_base) indiriyor + yalnız
-- tek-dövizliyse orijinali suffix olarak veriyordu. Bu RPC her (doktor, para
-- birimi) için ORİJİNAL toplam geliri döndürür (çevirisiz).
--
-- Fatura join/filtresi profitability_by_doctor'ın `cur` CTE'siyle BİREBİR:
--   invoices i JOIN work_orders wo ON i.work_order_id=wo.id
--   i.status<>'iptal', wo.lab_id, wo.created_at::DATE BETWEEN from..to, wo.status<>'iptal'
-- SECURITY DEFINER + lab_id parametresiyle izolasyon.
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.profitability_by_doctor_revenue_ccy(
  p_lab_id uuid, p_from date, p_to date
)
RETURNS TABLE(doctor_id uuid, currency text, revenue numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    wo.doctor_id,
    COALESCE(i.currency, 'TRY') AS currency,
    SUM(i.total)                AS revenue
  FROM work_orders wo
  JOIN invoices i ON i.work_order_id = wo.id AND i.status <> 'iptal'
  WHERE wo.lab_id = p_lab_id
    AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status <> 'iptal'
  GROUP BY wo.doctor_id, COALESCE(i.currency, 'TRY')
  HAVING SUM(i.total) <> 0;
$function$;

GRANT EXECUTE ON FUNCTION public.profitability_by_doctor_revenue_ccy(uuid, date, date) TO authenticated;
