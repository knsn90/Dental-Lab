-- ============================================================
-- 20260625 — Kârlılık: GELİR para birimi başına (hafif)
--
-- Karar: P&L'de Net Kâr/Maliyet/İşçilik/Materyal raporlama para biriminde (base)
-- kalır (çapraz-para kâr ortak birim gerektirir); ama GELİR per-currency gösterilir.
--
-- Bu fonksiyon, profitability_summary'nin GELİR tanımıyla BİREBİR aynı join/filtre
-- ile faturaları para birimine göre gruplar (orijinal total). Böylece ekrandaki
-- per-currency gelir, RPC'nin base gelir toplamıyla tutarlı kalır.
--
-- security definer + lab_id parametresi (RPC pattern). Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.profitability_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
RETURNS TABLE(currency text, revenue numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(i.currency, 'TRY') AS currency,
         SUM(i.total)                AS revenue
  FROM invoices i
  JOIN work_orders wo ON wo.id = i.work_order_id
  WHERE wo.lab_id = p_lab_id
    AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status <> 'iptal'
    AND i.status  <> 'iptal'
  GROUP BY COALESCE(i.currency, 'TRY')
  ORDER BY 1;
$function$;

GRANT EXECUTE ON FUNCTION public.profitability_revenue_ccy(uuid, date, date) TO authenticated;

-- ============================================================
-- DOĞRULAMA:
--   SELECT * FROM profitability_revenue_ccy('<lab_id>', '2026-01-01', '2026-12-31');
-- ============================================================
