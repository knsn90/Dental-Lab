-- ============================================================
-- 20260507 — Costing Refactor: Snapshot-based operational costing
--
-- Hedef:
--   • Sipariş maliyeti, OUT/WASTE movement'larındaki snapshot total_cost'tan
--     hesaplanır. "Bugünkü fiyat" değil, tüketim anındaki dondurulmuş fiyat.
--   • work_orders.material_cost — cache (recompute_order_cost RPC ile yenilenir).
--   • RETURN movement = QC reddi/rollback → eski cost restore edilir.
--   • Audit trail: movement'lar IMMUTABLE — silinmez, RETURN ile geri alınır.
--   • Future-ready: weighted avg / FIFO için altyapı (cost_method enum).
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ── 1. stock_movements: total_cost snapshot kolonları ──────
-- unit_cost_at_time zaten var (Phase 2). Total = quantity × unit_cost.
-- Bunu precomputed ve immutable saklarız → raporlar hızlı + kesin.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS total_cost_at_time numeric;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS total_cost_base_at_time numeric;

-- Mevcut kayıtlar için backfill: total = quantity × unit_cost
UPDATE public.stock_movements
SET total_cost_at_time = COALESCE(total_cost_at_time, quantity * COALESCE(unit_cost_at_time, 0)),
    total_cost_base_at_time = COALESCE(total_cost_base_at_time, quantity * COALESCE(unit_cost_base_at_time, unit_cost_at_time, 0))
WHERE total_cost_at_time IS NULL;

-- ── 2. RETURN movement type'ı destekle ──────────────────────
-- Mevcut CHECK constraint type için: 'IN','OUT','WASTE','ADJUST'
-- RETURN ekle (QC reddi / rollback için)
DO $$
BEGIN
  -- Mevcut constraint'i bul ve düşür
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'stock_movements' AND constraint_name LIKE '%type%check%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.stock_movements DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'stock_movements' AND constraint_type = 'CHECK' AND constraint_name LIKE '%type%check%'
      LIMIT 1
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check
    CHECK (type IN ('IN','OUT','WASTE','RETURN','ADJUST'));

-- Movement reference: RETURN bir başka movement'ı geri alır
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reverses
  ON public.stock_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

-- ── 3. work_orders.material_cost cache ─────────────────────
-- Sipariş maliyetinin cache'lenmiş hali (TRY base'de).
-- Yeni OUT/WASTE/RETURN sonrası recompute_order_cost ile yenilenir.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS material_cost numeric DEFAULT 0;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS material_cost_currency text DEFAULT 'TRY';

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS material_cost_updated_at timestamptz;

-- ── 4. lab_settings: cost_method (future-ready) ────────────
-- Şu an 'snapshot' (operational). İleride 'fifo' / 'weighted_avg' eklenebilir.
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS cost_method text DEFAULT 'snapshot';

ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_cost_method_check;

ALTER TABLE public.lab_settings
  ADD CONSTRAINT lab_settings_cost_method_check
    CHECK (cost_method IN ('snapshot','weighted_avg','fifo','manual'));

-- ── 5. recompute_order_cost(order_id) RPC ──────────────────
-- Bir siparişin material_cost'unu OUT/WASTE/RETURN movement'larından
-- yeniden hesaplar ve work_orders.material_cost'a cache'ler.
--
-- Formül:
--   material_cost =
--     SUM(OUT.total_cost_base) + SUM(WASTE.total_cost_base) - SUM(RETURN.total_cost_base)
--
-- Audit-safe: movement'lar silinmez, RETURN ile geri alınır.
CREATE OR REPLACE FUNCTION public.recompute_order_cost(p_order_id uuid)
RETURNS numeric AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(
      CASE type
        WHEN 'OUT'    THEN  COALESCE(total_cost_base_at_time, 0)
        WHEN 'WASTE'  THEN  COALESCE(total_cost_base_at_time, 0)
        WHEN 'RETURN' THEN -COALESCE(total_cost_base_at_time, 0)
        ELSE 0
      END
    ), 0)
  INTO v_total
  FROM public.stock_movements
  WHERE order_id = p_order_id
    AND COALESCE(is_reversed, FALSE) = FALSE;

  -- Cache'e yaz
  UPDATE public.work_orders
  SET material_cost = v_total,
      material_cost_currency = 'TRY',
      material_cost_updated_at = NOW()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ── 6. Trigger: movement değişince ilgili sipariş cost'u güncelle ──
CREATE OR REPLACE FUNCTION public.trg_recompute_order_cost()
RETURNS trigger AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NOT NULL THEN
    PERFORM public.recompute_order_cost(v_order_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movements_recompute ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_order_cost();

-- ── 7. RETURN movement RPC ─────────────────────────────────
-- QC reddi / rollback için: orijinal OUT/WASTE'i RETURN ile tersine çevir.
-- Stoğa miktarı geri ekle, snapshot cost'u "negatif" işle.
CREATE OR REPLACE FUNCTION public.create_return_movement(
  p_lab_id      uuid,
  p_original_movement_id uuid,
  p_reason      text DEFAULT 'qc_reject'
)
RETURNS uuid AS $$
DECLARE
  v_orig record;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_orig FROM public.stock_movements WHERE id = p_original_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original movement not found: %', p_original_movement_id;
  END IF;

  IF v_orig.type NOT IN ('OUT','WASTE') THEN
    RAISE EXCEPTION 'Only OUT/WASTE movements can be returned, got: %', v_orig.type;
  END IF;

  -- RETURN movement: aynı snapshot değerlerle, type=RETURN
  INSERT INTO public.stock_movements (
    lab_id, item_id, item_name, type, quantity, unit,
    unit_cost_at_time, currency, rate_at_time,
    unit_cost_base_at_time, base_currency_at_time,
    total_cost_at_time, total_cost_base_at_time,
    order_id, note, source, stage, user_id,
    reverses_movement_id
  ) VALUES (
    v_orig.lab_id, v_orig.item_id, v_orig.item_name, 'RETURN', v_orig.quantity, v_orig.unit,
    v_orig.unit_cost_at_time, v_orig.currency, v_orig.rate_at_time,
    v_orig.unit_cost_base_at_time, v_orig.base_currency_at_time,
    v_orig.total_cost_at_time, v_orig.total_cost_base_at_time,
    v_orig.order_id, p_reason, 'return', v_orig.stage, auth.uid(),
    p_original_movement_id
  )
  RETURNING id INTO v_new_id;

  -- Stoğa miktarı geri ekle
  IF v_orig.item_id IS NOT NULL THEN
    UPDATE public.stock_items
    SET quantity = quantity + v_orig.quantity,
        updated_at = NOW()
    WHERE id::text = v_orig.item_id;
  END IF;

  -- Trigger material_cost'u zaten yeniler

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ── 8. Backfill: mevcut work_orders'ın material_cost'unu hesapla ──
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.work_orders WHERE material_cost IS NULL OR material_cost = 0
  LOOP
    PERFORM public.recompute_order_cost(r.id);
  END LOOP;
END $$;

-- ============================================================
-- ✓ Costing refactor hazır:
--   • stock_movements.total_cost_at_time + total_cost_base_at_time (snapshot)
--   • RETURN movement type + reverses_movement_id audit link
--   • work_orders.material_cost cache (TRY base)
--   • lab_settings.cost_method (future: weighted_avg/fifo/manual)
--   • recompute_order_cost(order_id) RPC
--   • create_return_movement(original_id) RPC (rollback/QC reject)
--   • Trigger: stock_movements değişince ilgili sipariş cost'u auto-recompute
--   • Backfill: mevcut work_orders cost'ları hesaplandı
-- ============================================================
