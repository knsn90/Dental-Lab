-- ============================================================
-- 20260507 — Phase 2: Stok'a çoklu para birimi
--
-- Eklenenler:
--   • stock_movements.currency        — kayıt sırasındaki orijinal para birimi
--   • stock_movements.rate_at_time    — o anki kur (snapshot)
--   • stock_movements.unit_cost_base_at_time — base currency'de (snapshot)
--   • stock_items.default_purchase_currency — varsayılan alış para birimi
--   • stock_items.last_unit_cost_currency   — son alış orijinal currency
--
-- Snapshot: bir IN movement'ı kaydedildiğinde, o günün kuru DONDURULUR
-- ve unit_cost_base_at_time hesaplanır. Kur sonradan değişse bile
-- raporlar bu sabitlenmiş değeri kullanır → audit-friendly.
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ── 1. stock_movements: currency + rate snapshot ────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TRY';

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS rate_at_time numeric(18,6);

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost_base_at_time numeric;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS base_currency_at_time text DEFAULT 'TRY';

-- CHECK: currency desteklenenlerden biri olmalı
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_currency_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_currency_check
    CHECK (currency IS NULL OR currency IN ('TRY','EUR','USD','GBP'));

-- Backfill: mevcut kayıtlarda currency NULL ise TRY olarak işaretle
UPDATE public.stock_movements
SET currency = COALESCE(currency, 'TRY'),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    unit_cost_base_at_time = COALESCE(unit_cost_base_at_time, unit_cost_at_time)
WHERE currency IS NULL OR rate_at_time IS NULL;

-- ── 2. stock_items: default purchase currency ──────────────
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS default_purchase_currency text DEFAULT 'TRY';

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS last_unit_cost_currency text DEFAULT 'TRY';

ALTER TABLE public.stock_items
  DROP CONSTRAINT IF EXISTS stock_items_default_currency_check;

ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_default_currency_check
    CHECK (default_purchase_currency IN ('TRY','EUR','USD','GBP'));

ALTER TABLE public.stock_items
  DROP CONSTRAINT IF EXISTS stock_items_last_cost_currency_check;

ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_last_cost_currency_check
    CHECK (last_unit_cost_currency IN ('TRY','EUR','USD','GBP'));

-- ── 3. Index for cost queries (currency-aware) ──────────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_currency_type_date
  ON public.stock_movements (currency, type, created_at DESC);

-- ── 4. Helper RPC: stock_movement insert with snapshot ──────
-- Frontend, currency + unit_cost_at_time gönderir.
-- RPC, lab'in base currency'sini ve günün kurunu okur,
-- unit_cost_base_at_time'ı dondurarak kayıt yapar.
CREATE OR REPLACE FUNCTION public.create_stock_movement_with_snapshot(
  p_lab_id           uuid,
  p_item_id          text,
  p_item_name        text,
  p_type             text,
  p_quantity         numeric,
  p_unit             text,
  p_unit_cost_at_time numeric,
  p_currency         text DEFAULT 'TRY',
  p_order_id         uuid DEFAULT NULL,
  p_note             text DEFAULT NULL,
  p_source           text DEFAULT NULL,
  p_stage            text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_base_currency text;
  v_rate          numeric;
  v_base_cost     numeric;
  v_movement_id   uuid;
BEGIN
  -- Lab'in base currency'sini bul
  SELECT default_currency INTO v_base_currency
  FROM public.lab_settings
  WHERE lab_id = p_lab_id;

  IF v_base_currency IS NULL THEN
    v_base_currency := 'TRY';
  END IF;

  -- Kur snapshot
  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, CURRENT_DATE);

  -- Kur tanımlı değilse hata fırlat — frontend'in kuru girmesi gerekir
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> % on %',
      p_currency, v_base_currency, CURRENT_DATE
      USING ERRCODE = 'P0001';
  END IF;

  -- Base currency cost (snapshot)
  IF p_unit_cost_at_time IS NOT NULL THEN
    v_base_cost := p_unit_cost_at_time * COALESCE(v_rate, 1);
  END IF;

  INSERT INTO public.stock_movements (
    lab_id, item_id, item_name, type, quantity, unit,
    unit_cost_at_time, currency, rate_at_time,
    unit_cost_base_at_time, base_currency_at_time,
    order_id, note, source, stage, user_id
  ) VALUES (
    p_lab_id, p_item_id, p_item_name, p_type, p_quantity, p_unit,
    p_unit_cost_at_time, p_currency, COALESCE(v_rate, 1),
    v_base_cost, v_base_currency,
    p_order_id, p_note, p_source, p_stage, auth.uid()
  )
  RETURNING id INTO v_movement_id;

  -- IN ise stock_items.last_unit_cost_currency güncelle
  IF p_type = 'IN' AND p_item_id IS NOT NULL AND p_unit_cost_at_time IS NOT NULL THEN
    UPDATE public.stock_items
    SET last_unit_cost_currency = p_currency,
        unit_cost = p_unit_cost_at_time,
        updated_at = NOW()
    WHERE id::text = p_item_id;
  END IF;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Phase 2 hazır:
--   • stock_movements: currency + rate_at_time + unit_cost_base_at_time
--   • stock_items: default_purchase_currency + last_unit_cost_currency
--   • Backfill TRY = 1.0 mevcut kayıtlar için
--   • create_stock_movement_with_snapshot() RPC
-- ============================================================
