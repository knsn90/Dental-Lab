-- ============================================================================
-- 052_production_aware_stock.sql
-- Production-aware stock system. Extends stock_items (single source of truth).
--
-- Decisions:
--   • A: Extend, don't replace
--   • B: Hybrid — units_per_tooth now, future-proof for advanced rules
--   • C: Per-material consume_at_stage
--   • E: unit_cost stored for future cost tracking
--   • F: Auto-consume only ON stage completion (status = onaylandi)
--   • G: Data-driven — no hardcoded materials/stages
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend stock_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_items
  -- Material classification (free text — zircon/metal/emax/pmma/glaze/...)
  ADD COLUMN IF NOT EXISTS type TEXT,
  -- Usage category — production / office / misc (default misc to be safe)
  ADD COLUMN IF NOT EXISTS usage_category TEXT
    CHECK (usage_category IN ('production', 'office', 'misc')) DEFAULT 'misc',
  -- Per-material consumption rule (null/0 = no auto-consume)
  ADD COLUMN IF NOT EXISTS units_per_tooth NUMERIC(10, 4),
  -- Which stage triggers consumption — default MILLING
  ADD COLUMN IF NOT EXISTS consume_at_stage TEXT DEFAULT 'MILLING',
  -- Cost tracking (stored for future P&L; UI may not show yet)
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2) DEFAULT 0;

-- Useful index for lookup during consumption
CREATE INDEX IF NOT EXISTS idx_stock_items_production
  ON stock_items(lab_id, usage_category, type, consume_at_stage)
  WHERE usage_category = 'production';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auto-consumption trigger
--    Fires when an order_stage transitions to 'onaylandi' (manager-approved).
--    Looks up matching production stock_item (by lab + case_type + stage),
--    deducts qty = tooth_count × units_per_tooth, logs stock_movement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_auto_consume_materials()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_stage         TEXT;
  v_lab_id        UUID;
  v_case_type     TEXT;
  v_tooth_count   INT;
  v_item          stock_items%ROWTYPE;
  v_qty_used      NUMERIC;
BEGIN
  -- Only on aktif/tamamlandi → onaylandi (success path)
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'onaylandi' THEN RETURN NEW; END IF;
  IF OLD.status NOT IN ('aktif', 'tamamlandi') THEN RETURN NEW; END IF;

  v_stage := _stage_for_station(NEW.station_id);

  -- Pull order context
  SELECT lab_id, case_type, COALESCE(array_length(tooth_numbers, 1), 0)
    INTO v_lab_id, v_case_type, v_tooth_count
    FROM work_orders
   WHERE id = NEW.work_order_id;

  IF v_lab_id IS NULL OR v_tooth_count = 0 THEN RETURN NEW; END IF;

  -- Find ONE matching production material (oldest stock first — FIFO).
  -- Match: same lab, production usage, case_type → material.type, current stage.
  -- units_per_tooth must be set (>0) to trigger.
  SELECT * INTO v_item
    FROM stock_items
   WHERE lab_id = v_lab_id
     AND usage_category = 'production'
     AND consume_at_stage = v_stage
     AND units_per_tooth IS NOT NULL
     AND units_per_tooth > 0
     AND (
       v_case_type IS NULL
       OR LOWER(type) = LOWER(v_case_type)
       OR LOWER(type) LIKE LOWER(v_case_type) || '%'
     )
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_item.id IS NULL THEN
    -- No matching production material; that's OK (e.g. office items)
    RETURN NEW;
  END IF;

  v_qty_used := v_tooth_count * v_item.units_per_tooth;

  -- Deduct stock
  UPDATE stock_items
     SET quantity = quantity - v_qty_used
   WHERE id = v_item.id;

  -- Log movement (negative qty for OUT)
  INSERT INTO stock_movements (
    lab_id, item_id, item_name, type, quantity, source, order_id, note
  ) VALUES (
    v_lab_id, v_item.id, v_item.name, 'OUT', v_qty_used, 'production',
    NEW.work_order_id,
    'Auto: ' || v_stage || ' stage completed (' || v_tooth_count || ' diş × ' || v_item.units_per_tooth || ')'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the workflow on stock errors — log and continue
  RAISE WARNING '[auto_consume_materials] failed for wo=% stage=%: %',
    NEW.work_order_id, v_stage, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_stages_auto_consume ON order_stages;
CREATE TRIGGER order_stages_auto_consume
  AFTER UPDATE ON order_stages
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_consume_materials();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. stock_movements — guard columns (some may already exist; align for trigger)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS source   TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note     TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_movements_order
  ON stock_movements(order_id) WHERE order_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper view — low stock items
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_low_stock AS
  SELECT id, lab_id, name, type, quantity, min_quantity, unit,
         usage_category, consume_at_stage,
         CASE
           WHEN quantity = 0                     THEN 'OUT'
           WHEN quantity < min_quantity          THEN 'LOW'
           WHEN quantity < min_quantity * 1.25   THEN 'WARN'
           ELSE 'OK'
         END AS stock_status
    FROM stock_items
   WHERE min_quantity > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helper RPC — list materials used by an order (for OrderDetailScreen)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION list_order_materials(p_work_order_id UUID)
RETURNS TABLE (
  movement_id  UUID,
  item_id      UUID,
  name         TEXT,
  type         TEXT,
  quantity     NUMERIC,
  unit         TEXT,
  source       TEXT,
  created_at   TIMESTAMPTZ,
  note         TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT m.id, m.item_id, m.item_name, si.type, m.quantity, si.unit,
         m.source, m.created_at, m.note
    FROM stock_movements m
    LEFT JOIN stock_items si ON si.id = m.item_id
   WHERE m.order_id = p_work_order_id
     AND m.type = 'OUT'
   ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_order_materials(UUID) TO authenticated;

COMMIT;
