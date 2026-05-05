-- ============================================================
-- Migration: Missing RPC Functions
--
-- Adds 12 RPC functions that are called in the frontend code
-- but were never tracked in migrations (created via dashboard).
-- ============================================================

-- ─── 1. calculate_order_cost ────────────────────────────────────────────
-- Returns material cost breakdown for a work order
CREATE OR REPLACE FUNCTION calculate_order_cost(p_work_order_id UUID)
RETURNS TABLE (
  material_id   UUID,
  material_name TEXT,
  quantity      NUMERIC,
  unit_price    NUMERIC,
  total_cost    NUMERIC,
  stage         TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.item_id   AS material_id,
    si.name            AS material_name,
    sm.quantity,
    si.unit_price,
    (sm.quantity * COALESCE(si.unit_price, 0)) AS total_cost,
    sm.notes           AS stage
  FROM stock_movements sm
  JOIN stock_items si ON si.id::TEXT = sm.item_id
  WHERE sm.order_id = p_work_order_id
    AND sm.type = 'OUT'
  ORDER BY sm.created_at;
END;
$$;

-- ─── 2. calculate_order_profit ──────────────────────────────────────────
-- Returns profit summary for a work order
CREATE OR REPLACE FUNCTION calculate_order_profit(p_work_order_id UUID)
RETURNS TABLE (
  revenue        NUMERIC,
  material_cost  NUMERIC,
  labor_cost     NUMERIC,
  total_cost     NUMERIC,
  profit         NUMERIC,
  margin_pct     NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_revenue NUMERIC;
  v_material NUMERIC;
  v_labor NUMERIC;
BEGIN
  -- Revenue from order price
  SELECT COALESCE(wo.price, 0) INTO v_revenue
  FROM work_orders wo WHERE wo.id = p_work_order_id;

  -- Material cost
  SELECT COALESCE(SUM(sm.quantity * COALESCE(si.unit_price, 0)), 0) INTO v_material
  FROM stock_movements sm
  JOIN stock_items si ON si.id::TEXT = sm.item_id
  WHERE sm.order_id = p_work_order_id AND sm.type = 'OUT';

  -- Labor cost from stage logs
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0
    * COALESCE(p.hourly_rate, 0)
  ), 0) INTO v_labor
  FROM stage_log sl
  LEFT JOIN profiles p ON p.id = sl.owner_id
  WHERE sl.work_order_id = p_work_order_id
    AND sl.end_time IS NOT NULL;

  RETURN QUERY SELECT
    v_revenue,
    v_material,
    v_labor,
    (v_material + v_labor),
    (v_revenue - v_material - v_labor),
    CASE WHEN v_revenue > 0
      THEN ROUND(((v_revenue - v_material - v_labor) / v_revenue) * 100, 1)
      ELSE 0
    END;
END;
$$;

-- ─── 3. list_order_labor ────────────────────────────────────────────────
-- Returns labor time breakdown per technician for an order
CREATE OR REPLACE FUNCTION list_order_labor(p_work_order_id UUID)
RETURNS TABLE (
  user_id       UUID,
  full_name     TEXT,
  stage         TEXT,
  hours         NUMERIC,
  hourly_rate   NUMERIC,
  cost          NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.owner_id,
    p.full_name,
    sl.stage,
    ROUND(EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0, 2) AS hours,
    COALESCE(p.hourly_rate, 0) AS hourly_rate,
    ROUND(
      EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0
      * COALESCE(p.hourly_rate, 0), 2
    ) AS cost
  FROM stage_log sl
  JOIN profiles p ON p.id = sl.owner_id
  WHERE sl.work_order_id = p_work_order_id
    AND sl.end_time IS NOT NULL
  ORDER BY sl.start_time;
END;
$$;

-- ─── 4. forecast_order_materials ────────────────────────────────────────
-- Predicts required materials for an order based on similar past orders
CREATE OR REPLACE FUNCTION forecast_order_materials(p_work_order_id UUID)
RETURNS TABLE (
  material_id    UUID,
  material_name  TEXT,
  predicted_qty  NUMERIC,
  unit           TEXT,
  avg_cost       NUMERIC,
  confidence     NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_service_type TEXT;
  v_lab_id UUID;
BEGIN
  SELECT wo.service_type, wo.lab_id INTO v_service_type, v_lab_id
  FROM work_orders wo WHERE wo.id = p_work_order_id;

  RETURN QUERY
  SELECT
    si.id AS material_id,
    si.name AS material_name,
    ROUND(AVG(sm.quantity), 2) AS predicted_qty,
    si.unit,
    ROUND(AVG(sm.quantity * COALESCE(si.unit_price, 0)), 2) AS avg_cost,
    LEAST(ROUND(COUNT(*)::NUMERIC / 10.0, 2), 1.0) AS confidence
  FROM stock_movements sm
  JOIN stock_items si ON si.id::TEXT = sm.item_id
  JOIN work_orders wo ON wo.id = sm.order_id
  WHERE wo.service_type = v_service_type
    AND wo.lab_id = v_lab_id
    AND sm.type = 'OUT'
    AND wo.id != p_work_order_id
  GROUP BY si.id, si.name, si.unit
  ORDER BY AVG(sm.quantity) DESC;
END;
$$;

-- ─── 5. record_stage_consumption ────────────────────────────────────────
-- Records material consumption for a production stage
CREATE OR REPLACE FUNCTION record_stage_consumption(
  p_work_order_id UUID,
  p_stage         TEXT,
  p_items         JSONB,   -- [{item_id, quantity}]
  p_user_id       UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  item JSONB;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO stock_movements (item_id, order_id, type, quantity, notes, user_id)
    VALUES (
      (item->>'item_id')::UUID,
      p_work_order_id,
      'OUT',
      (item->>'quantity')::NUMERIC,
      p_stage,
      p_user_id
    );

    -- Decrease stock
    UPDATE stock_items
    SET quantity = quantity - (item->>'quantity')::NUMERIC,
        updated_at = NOW()
    WHERE id = (item->>'item_id')::UUID;
  END LOOP;
END;
$$;

-- ─── 6. record_waste ────────────────────────────────────────────────────
-- Records wasted material
CREATE OR REPLACE FUNCTION record_waste(
  p_item_id   UUID,
  p_quantity  NUMERIC,
  p_user_id   UUID,
  p_order_id  UUID DEFAULT NULL,
  p_reason    TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO stock_movements (item_id, order_id, type, quantity, notes, user_id)
  VALUES (p_item_id, p_order_id, 'WASTE', p_quantity, p_reason, p_user_id);

  -- Decrease stock
  UPDATE stock_items
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE id = p_item_id;
END;
$$;

-- ─── 7. profitability_summary ───────────────────────────────────────────
-- Overall profitability summary for a lab in a date range
CREATE OR REPLACE FUNCTION profitability_summary(
  p_lab_id UUID,
  p_from   DATE,
  p_to     DATE
) RETURNS TABLE (
  total_revenue    NUMERIC,
  total_cost       NUMERIC,
  total_profit     NUMERIC,
  avg_margin_pct   NUMERIC,
  order_count      BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH order_profits AS (
    SELECT
      COALESCE(wo.price, 0) AS revenue,
      COALESCE((
        SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
        FROM stock_movements sm
        JOIN stock_items si ON si.id::TEXT = sm.item_id
        WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
      ), 0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id = p_lab_id
      AND wo.created_at::DATE BETWEEN p_from AND p_to
      AND wo.status != 'cancelled'
  )
  SELECT
    COALESCE(SUM(op.revenue), 0),
    COALESCE(SUM(op.cost), 0),
    COALESCE(SUM(op.revenue - op.cost), 0),
    CASE WHEN SUM(op.revenue) > 0
      THEN ROUND((SUM(op.revenue - op.cost) / SUM(op.revenue)) * 100, 1)
      ELSE 0
    END,
    COUNT(*)
  FROM order_profits op;
END;
$$;

-- ─── 8. profitability_top_orders ────────────────────────────────────────
-- Top N orders by profit (best or worst)
CREATE OR REPLACE FUNCTION profitability_top_orders(
  p_lab_id    UUID,
  p_limit     INT,
  p_order_by  TEXT,  -- 'best' or 'worst'
  p_from      DATE,
  p_to        DATE
) RETURNS TABLE (
  order_id     UUID,
  order_number TEXT,
  doctor_name  TEXT,
  revenue      NUMERIC,
  cost         NUMERIC,
  profit       NUMERIC,
  margin_pct   NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    wo.id AS order_id,
    wo.order_number,
    d.full_name AS doctor_name,
    COALESCE(wo.price, 0) AS revenue,
    COALESCE((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
    ), 0) AS cost,
    COALESCE(wo.price, 0) - COALESCE((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
    ), 0) AS profit,
    CASE WHEN COALESCE(wo.price, 0) > 0
      THEN ROUND(((COALESCE(wo.price, 0) - COALESCE((
        SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
        FROM stock_movements sm
        JOIN stock_items si ON si.id::TEXT = sm.item_id
        WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
      ), 0)) / wo.price) * 100, 1)
      ELSE 0
    END AS margin_pct
  FROM work_orders wo
  LEFT JOIN profiles d ON d.id = wo.doctor_id
  WHERE wo.lab_id = p_lab_id
    AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status != 'cancelled'
  ORDER BY
    CASE WHEN p_order_by = 'best' THEN
      COALESCE(wo.price, 0) - COALESCE((
        SELECT SUM(sm2.quantity * COALESCE(si2.unit_price, 0))
        FROM stock_movements sm2
        JOIN stock_items si2 ON si2.id::TEXT = sm2.item_id
        WHERE sm2.order_id = wo.id AND sm2.type IN ('OUT', 'WASTE')
      ), 0)
    END DESC NULLS LAST,
    CASE WHEN p_order_by = 'worst' THEN
      COALESCE(wo.price, 0) - COALESCE((
        SELECT SUM(sm2.quantity * COALESCE(si2.unit_price, 0))
        FROM stock_movements sm2
        JOIN stock_items si2 ON si2.id::TEXT = sm2.item_id
        WHERE sm2.order_id = wo.id AND sm2.type IN ('OUT', 'WASTE')
      ), 0)
    END ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- ─── 9. profitability_by_doctor ─────────────────────────────────────────
-- Profitability breakdown by doctor
CREATE OR REPLACE FUNCTION profitability_by_doctor(
  p_lab_id UUID,
  p_from   DATE,
  p_to     DATE
) RETURNS TABLE (
  doctor_id    UUID,
  doctor_name  TEXT,
  order_count  BIGINT,
  revenue      NUMERIC,
  cost         NUMERIC,
  profit       NUMERIC,
  margin_pct   NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    wo.doctor_id,
    d.full_name AS doctor_name,
    COUNT(*) AS order_count,
    COALESCE(SUM(wo.price), 0) AS revenue,
    COALESCE(SUM((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
    )), 0) AS cost,
    COALESCE(SUM(wo.price), 0) - COALESCE(SUM((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
    )), 0) AS profit,
    CASE WHEN SUM(wo.price) > 0
      THEN ROUND(((SUM(wo.price) - COALESCE(SUM((
        SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
        FROM stock_movements sm
        JOIN stock_items si ON si.id::TEXT = sm.item_id
        WHERE sm.order_id = wo.id AND sm.type IN ('OUT', 'WASTE')
      )), 0)) / SUM(wo.price)) * 100, 1)
      ELSE 0
    END AS margin_pct
  FROM work_orders wo
  LEFT JOIN profiles d ON d.id = wo.doctor_id
  WHERE wo.lab_id = p_lab_id
    AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status != 'cancelled'
  GROUP BY wo.doctor_id, d.full_name
  ORDER BY profit DESC;
END;
$$;

-- ─── 10. report_technician_usage ────────────────────────────────────────
-- Material usage breakdown by technician
CREATE OR REPLACE FUNCTION report_technician_usage(
  p_lab_id UUID,
  p_from   DATE,
  p_to     DATE
) RETURNS TABLE (
  user_id        UUID,
  full_name      TEXT,
  total_items    BIGINT,
  total_quantity NUMERIC,
  total_cost     NUMERIC,
  waste_quantity NUMERIC,
  waste_cost     NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.user_id,
    p.full_name,
    COUNT(*) AS total_items,
    SUM(sm.quantity) AS total_quantity,
    SUM(sm.quantity * COALESCE(si.unit_price, 0)) AS total_cost,
    SUM(CASE WHEN sm.type = 'WASTE' THEN sm.quantity ELSE 0 END) AS waste_quantity,
    SUM(CASE WHEN sm.type = 'WASTE' THEN sm.quantity * COALESCE(si.unit_price, 0) ELSE 0 END) AS waste_cost
  FROM stock_movements sm
  JOIN stock_items si ON si.id::TEXT = sm.item_id
  JOIN profiles p ON p.id = sm.user_id
  WHERE sm.type IN ('OUT', 'WASTE')
    AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND EXISTS (
      SELECT 1 FROM profiles pp WHERE pp.id = sm.user_id AND pp.lab_id = p_lab_id
    )
  GROUP BY sm.user_id, p.full_name
  ORDER BY total_cost DESC;
END;
$$;

-- ─── 11. report_material_waste ──────────────────────────────────────────
-- Material waste report
CREATE OR REPLACE FUNCTION report_material_waste(
  p_lab_id UUID,
  p_from   DATE,
  p_to     DATE
) RETURNS TABLE (
  material_id    UUID,
  material_name  TEXT,
  waste_quantity NUMERIC,
  waste_cost     NUMERIC,
  waste_events   BIGINT,
  unit           TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.id AS material_id,
    si.name AS material_name,
    SUM(sm.quantity) AS waste_quantity,
    SUM(sm.quantity * COALESCE(si.unit_price, 0)) AS waste_cost,
    COUNT(*) AS waste_events,
    si.unit
  FROM stock_movements sm
  JOIN stock_items si ON si.id::TEXT = sm.item_id
  WHERE sm.type = 'WASTE'
    AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND si.lab_id = p_lab_id
  GROUP BY si.id, si.name, si.unit
  ORDER BY waste_cost DESC;
END;
$$;

-- ─── 12. report_technician_performance ──────────────────────────────────
-- Technician performance: orders completed, time, efficiency
CREATE OR REPLACE FUNCTION report_technician_performance(
  p_lab_id        UUID,
  p_from          DATE,
  p_to            DATE,
  p_material_type TEXT DEFAULT NULL
) RETURNS TABLE (
  user_id          UUID,
  full_name        TEXT,
  orders_completed BIGINT,
  total_hours      NUMERIC,
  avg_hours        NUMERIC,
  material_cost    NUMERIC,
  waste_cost       NUMERIC,
  efficiency_score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.owner_id,
    p.full_name,
    COUNT(DISTINCT sl.work_order_id) AS orders_completed,
    ROUND(SUM(EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0), 1) AS total_hours,
    ROUND(AVG(EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0), 2) AS avg_hours,
    COALESCE((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.user_id = sl.owner_id
        AND sm.type = 'OUT'
        AND sm.created_at::DATE BETWEEN p_from AND p_to
        AND (p_material_type IS NULL OR si.category = p_material_type)
    ), 0) AS material_cost,
    COALESCE((
      SELECT SUM(sm.quantity * COALESCE(si.unit_price, 0))
      FROM stock_movements sm
      JOIN stock_items si ON si.id::TEXT = sm.item_id
      WHERE sm.user_id = sl.owner_id
        AND sm.type = 'WASTE'
        AND sm.created_at::DATE BETWEEN p_from AND p_to
        AND (p_material_type IS NULL OR si.category = p_material_type)
    ), 0) AS waste_cost,
    -- Efficiency: higher is better (orders / hours)
    CASE WHEN SUM(EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0) > 0
      THEN ROUND(COUNT(DISTINCT sl.work_order_id)::NUMERIC /
           SUM(EXTRACT(EPOCH FROM (sl.end_time - sl.start_time)) / 3600.0), 2)
      ELSE 0
    END AS efficiency_score
  FROM stage_log sl
  JOIN profiles p ON p.id = sl.owner_id
  WHERE sl.end_time IS NOT NULL
    AND sl.start_time::DATE BETWEEN p_from AND p_to
    AND p.lab_id = p_lab_id
  GROUP BY sl.owner_id, p.full_name
  ORDER BY orders_completed DESC;
END;
$$;
