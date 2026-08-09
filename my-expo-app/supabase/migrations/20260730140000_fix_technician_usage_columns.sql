-- ============================================================
-- 20260730 — report_technician_usage kolonlarını UI ile hizala
--
-- Sorun: ProfitabilityScreen "Teknisyen Verimliliği" kartı boş/0 gösteriyordu
-- (isim "—", "0 kullanım · 0 fire", "%100 verim"). Sebep: RPC dönüş kolonları UI
-- tipiyle (TechnicianUsageRow) uyuşmuyordu:
--   RPC: full_name, total_quantity, total_cost, waste_quantity  (+ efficiency YOK)
--   UI : user_name, used_qty,       used_cost,  waste_qty, efficiency_pct
-- UI kayan alanları undefined okuyup 0 / null(→%100) gösteriyordu. Veri sağlamdı.
--
-- Çözüm: RPC'yi UI'nin beklediği kolonlarla yeniden yaz; used = OUT, waste = WASTE,
-- efficiency = used/(used+waste)×100 (fire yoksa %100). İmza (uuid,date,date) sabit
-- → uygulama deploy'u gerekmez. Kolon adları değiştiği için DROP+CREATE.
-- ============================================================

DROP FUNCTION IF EXISTS public.report_technician_usage(uuid, date, date);

CREATE OR REPLACE FUNCTION public.report_technician_usage(p_lab_id uuid, p_from date, p_to date)
RETURNS TABLE(
  user_id uuid, user_name text,
  used_qty numeric, used_cost numeric,
  waste_qty numeric, waste_cost numeric,
  total_qty numeric, efficiency_pct numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.user_id,
    COALESCE(p.full_name, 'Bilinmeyen') AS user_name,
    SUM(CASE WHEN sm.type='OUT'   THEN sm.quantity ELSE 0 END)::numeric AS used_qty,
    SUM(CASE WHEN sm.type='OUT'   THEN COALESCE(sm.total_cost_at_time,0) ELSE 0 END)::numeric AS used_cost,
    SUM(CASE WHEN sm.type='WASTE' THEN sm.quantity ELSE 0 END)::numeric AS waste_qty,
    SUM(CASE WHEN sm.type='WASTE' THEN COALESCE(sm.total_cost_at_time,0) ELSE 0 END)::numeric AS waste_cost,
    SUM(sm.quantity)::numeric AS total_qty,
    CASE WHEN SUM(sm.quantity) > 0
      THEN ROUND(SUM(CASE WHEN sm.type='OUT' THEN sm.quantity ELSE 0 END) / SUM(sm.quantity) * 100, 1)
      ELSE 100 END::numeric AS efficiency_pct
  FROM stock_movements sm
  JOIN profiles p ON p.id = sm.user_id
  WHERE sm.type IN ('OUT','WASTE')
    AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND p.lab_id = p_lab_id
    AND p.role = 'technician'   -- yalnız teknisyenler (admin/manager/kurye tüketimi hariç)
  GROUP BY sm.user_id, p.full_name
  ORDER BY 4 DESC;
END;
$$;
