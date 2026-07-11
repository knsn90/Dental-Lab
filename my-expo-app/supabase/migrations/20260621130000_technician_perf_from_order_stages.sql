-- Ekip/Teknisyen Performansı: report_technician_performance ESKİ 'stage_log' tablosundan
-- okuyordu; modern istasyon iş akışı artık 'order_stages'e yazıyor (stage_log ölü).
-- Bu yüzden sipariş/süre/verim/kar katkısı HER ZAMAN 0 dönüyordu. RPC order_stages'e taşındı.
--   • orders_completed = tamamlanmış (completed_at dolu) stage'lerin benzersiz iş emri sayısı
--   • total/avg_hours  = order_stages.duration_min toplam/ortalama → saat
--   • material/waste   = stock_movements (teknisyen user_id, OUT/WASTE) — değişmedi
--   • efficiency       = sipariş / saat
CREATE OR REPLACE FUNCTION public.report_technician_performance(
  p_lab_id        uuid,
  p_from          date,
  p_to            date,
  p_material_type text DEFAULT NULL
) RETURNS TABLE (
  user_id          uuid,
  full_name        text,
  orders_completed bigint,
  total_hours      numeric,
  avg_hours        numeric,
  material_cost    numeric,
  waste_cost       numeric,
  efficiency_score numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.technician_id,
    p.full_name,
    COUNT(DISTINCT os.work_order_id) AS orders_completed,
    ROUND(COALESCE(SUM(os.duration_min), 0) / 60.0, 1) AS total_hours,
    ROUND(COALESCE(AVG(os.duration_min), 0) / 60.0, 2)  AS avg_hours,
    COALESCE((
      SELECT SUM(COALESCE(sm.total_cost_at_time, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id = sm.item_id
      WHERE sm.user_id = os.technician_id
        AND sm.type = 'OUT'
        AND sm.created_at::DATE BETWEEN p_from AND p_to
        AND (p_material_type IS NULL OR si.category = p_material_type)
    ), 0) AS material_cost,
    COALESCE((
      SELECT SUM(COALESCE(sm.total_cost_at_time, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id = sm.item_id
      WHERE sm.user_id = os.technician_id
        AND sm.type = 'WASTE'
        AND sm.created_at::DATE BETWEEN p_from AND p_to
        AND (p_material_type IS NULL OR si.category = p_material_type)
    ), 0) AS waste_cost,
    CASE WHEN COALESCE(SUM(os.duration_min), 0) > 0
      THEN ROUND(COUNT(DISTINCT os.work_order_id)::NUMERIC / (SUM(os.duration_min) / 60.0), 2)
      ELSE 0
    END AS efficiency_score
  FROM order_stages os
  JOIN profiles    p  ON p.id  = os.technician_id
  JOIN work_orders wo ON wo.id = os.work_order_id
  WHERE os.technician_id IS NOT NULL
    AND os.completed_at IS NOT NULL
    AND COALESCE(os.completed_at, os.started_at)::DATE BETWEEN p_from AND p_to
    AND wo.lab_id = p_lab_id
  GROUP BY os.technician_id, p.full_name
  ORDER BY orders_completed DESC;
END;
$$;
