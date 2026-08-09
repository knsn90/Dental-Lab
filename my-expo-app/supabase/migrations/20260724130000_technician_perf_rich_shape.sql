-- ═══════════════════════════════════════════════════════════════════════════
-- report_technician_performance — ekranların beklediği ZENGİN şekle yükseltildi.
--
-- Sorun: 20260621130000 RPC'yi order_stages'e taşıdı ama BASİT şekli korudu
-- (orders_completed, total_hours, material_cost, waste_cost, efficiency_score).
-- Oysa iki ekran da (Ekip>Performans + Finans>Teknisyen) ZENGİN şekli okuyor:
-- user_name, hourly_rate, used_qty/cost, waste_qty/cost, efficiency_pct,
-- labor_minutes/hours/cost, orders_worked, profit_contribution.
-- Alan adları tutmadığı için isimler "?" ve tüm metrikler 0 görünüyordu.
--
-- profit_contribution: siparişin net kârı (calculate_order_profit, baz para
-- birimine çevrili) teknisyenin o siparişteki tamamlanmış aşama-DAKİKA payına
-- göre bölünür. Kâr zaten tüm maliyetleri (malzeme+işçilik+lojistik+overhead)
-- netlediği için ayrıca düşülmez (çift-sayma olmaz) — "adil pay" yaklaşımı.
--
-- Şekil değiştiği için CREATE OR REPLACE yetmez → DROP + CREATE.
-- İmza (argümanlar) aynı kalır → istemci değişmez, sadece DB.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.report_technician_performance(uuid, date, date, text);

CREATE FUNCTION public.report_technician_performance(
  p_lab_id        uuid,
  p_from          date,
  p_to            date,
  p_material_type text DEFAULT NULL
) RETURNS TABLE (
  user_id             uuid,
  user_name           text,
  hourly_rate         numeric,
  used_qty            numeric,
  used_cost           numeric,
  waste_qty           numeric,
  waste_cost          numeric,
  efficiency_pct      numeric,
  labor_minutes       numeric,
  labor_hours         numeric,
  labor_cost          numeric,
  orders_worked       bigint,
  profit_contribution numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base text;
BEGIN
  SELECT COALESCE(default_currency, 'TRY') INTO v_base FROM lab_settings WHERE lab_id = p_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  RETURN QUERY
  WITH
  -- Teknisyenin dönemde TAMAMLADIĞI aşamalar (order_stages)
  stg AS (
    SELECT os.technician_id, os.work_order_id,
           SUM(COALESCE(os.duration_min, 0))      AS mins,
           SUM(COALESCE(os.estimated_minutes, 0)) AS est_mins
    FROM order_stages os
    JOIN work_orders wo ON wo.id = os.work_order_id
    WHERE os.technician_id IS NOT NULL
      AND os.completed_at IS NOT NULL
      AND os.completed_at::date BETWEEN p_from AND p_to
      AND wo.lab_id = p_lab_id
    GROUP BY os.technician_id, os.work_order_id
  ),
  -- Siparişin TÜM tamamlanmış aşama dakikaları (pay paydası)
  order_tot AS (
    SELECT os.work_order_id, SUM(COALESCE(os.duration_min, 0)) AS total_mins
    FROM order_stages os
    WHERE os.completed_at IS NOT NULL
      AND os.work_order_id IN (SELECT DISTINCT work_order_id FROM stg)
    GROUP BY os.work_order_id
  ),
  -- Sipariş net kârı → baz para birimine çevrili
  order_profit AS (
    SELECT s.work_order_id,
           op.profit * COALESCE(
             public.get_currency_rate(p_lab_id, op.currency, v_base,
               COALESCE(wo.delivery_date, wo.created_at::date)), 1) AS profit_base
    FROM (SELECT DISTINCT work_order_id FROM stg) s
    JOIN work_orders wo ON wo.id = s.work_order_id
    CROSS JOIN LATERAL public.calculate_order_profit(s.work_order_id) op
  ),
  -- Teknisyen bazında toplu operasyonel
  agg AS (
    SELECT stg.technician_id AS tid,
           COUNT(DISTINCT stg.work_order_id) AS orders_worked,
           SUM(stg.mins)     AS labor_minutes,
           SUM(stg.est_mins) AS est_minutes
    FROM stg GROUP BY stg.technician_id
  ),
  -- Kâr katkısı (dakika payı × sipariş kârı)
  prof AS (
    SELECT stg.technician_id AS tid,
           SUM(
             COALESCE(opf.profit_base, 0)
             * CASE WHEN ot.total_mins > 0 THEN stg.mins::numeric / ot.total_mins ELSE 0 END
           ) AS profit_contribution
    FROM stg
    JOIN order_tot ot ON ot.work_order_id = stg.work_order_id
    LEFT JOIN order_profit opf ON opf.work_order_id = stg.work_order_id
    GROUP BY stg.technician_id
  ),
  -- Malzeme (OUT) + fire (WASTE) — teknisyen stok hareketlerinden
  mat AS (
    SELECT sm.user_id AS tid,
      SUM(CASE WHEN sm.type = 'OUT'   THEN COALESCE(sm.quantity, 0)           ELSE 0 END) AS used_qty,
      SUM(CASE WHEN sm.type = 'OUT'   THEN COALESCE(sm.total_cost_at_time, 0) ELSE 0 END) AS used_cost,
      SUM(CASE WHEN sm.type = 'WASTE' THEN COALESCE(sm.quantity, 0)           ELSE 0 END) AS waste_qty,
      SUM(CASE WHEN sm.type = 'WASTE' THEN COALESCE(sm.total_cost_at_time, 0) ELSE 0 END) AS waste_cost
    FROM stock_movements sm
    JOIN stock_items si ON si.id = sm.item_id
    WHERE sm.type IN ('OUT', 'WASTE')
      AND sm.created_at::date BETWEEN p_from AND p_to
      AND (p_material_type IS NULL OR si.category = p_material_type)
      AND sm.user_id IN (SELECT DISTINCT technician_id FROM stg)
    GROUP BY sm.user_id
  )
  SELECT
    a.tid,
    p.full_name,
    COALESCE(p.hourly_rate, 0)::numeric,
    COALESCE(m.used_qty, 0)::numeric,
    COALESCE(m.used_cost, 0)::numeric,
    COALESCE(m.waste_qty, 0)::numeric,
    COALESCE(m.waste_cost, 0)::numeric,
    CASE WHEN a.labor_minutes > 0 AND a.est_minutes > 0
      THEN ROUND(LEAST(200, a.est_minutes::numeric / a.labor_minutes * 100), 0)
      ELSE NULL END,
    a.labor_minutes::numeric,
    ROUND(a.labor_minutes / 60.0, 2),
    ROUND(a.labor_minutes / 60.0 * COALESCE(p.hourly_rate, 0), 2),
    a.orders_worked,
    ROUND(COALESCE(pr.profit_contribution, 0), 2)
  FROM agg a
  JOIN profiles p ON p.id = a.tid
  LEFT JOIN prof pr ON pr.tid = a.tid
  LEFT JOIN mat  m  ON m.tid  = a.tid
  ORDER BY a.orders_worked DESC;
END;
$$;
