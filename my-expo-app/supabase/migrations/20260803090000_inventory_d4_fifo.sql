-- ============================================================================
-- Envanter D4 — FIFO katmanları + tahsisler
--
-- Kullanıcı kararı: "Ortalama maliyet yöntemi KULLANILMAYACAKTIR" → FIFO
-- tüm kalemler için zorunlu.
--
-- Tasarım: FIFO mevcut deftere (stock_movements) TRIGGER ile bağlanır; hiçbir
-- RPC değişmez. Satın alma, aşama tüketimi, sayım düzeltmesi ve iadeler
-- otomatik katmanlanır.
--   IN / RETURN / ADJUST(+)  → yeni katman
--   OUT / WASTE / ADJUST(-)  → en eski katmandan sıralı tahsis
--
-- Stok yetmezse GİZLENMEZ: layer_id NULL + is_uncovered=true bir tahsis satırı
-- yazılır. Tahsis toplamı her zaman tüketilen miktara eşittir.
--
-- ÖNEMLİ (canlı veride bulunan iki tuzak):
--  1. Baz para birimi SNAPSHOT'tır. Nexadent'in default_currency'si sonradan
--     TRY→EUR değişmiş; güncel ayarı geçmişe uygulamak *_base değerlerini
--     ~53 kat yanlış gösteriyordu. base_currency her satırda saklanır.
--  2. cost_base, unit_cost_base_at_time'dan DEĞİL kurdan türetilir. Bazı
--     hareketlerde unit_cost (0.45 EUR) ile unit_cost_base_at_time (23.933)
--     tutarsız; ikisini çarpmak 227.364 gibi saçma tabanlar üretiyordu.
--     cost_base = cost × rate her zaman tutarlıdır.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fifo_layers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id         uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  stock_item_id  uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  movement_id    uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  lot_no         text,
  expiry_date    date,
  qty_in         numeric NOT NULL CHECK (qty_in > 0),
  qty_remaining  numeric NOT NULL CHECK (qty_remaining >= 0),
  unit           text,
  unit_cost      numeric NOT NULL DEFAULT 0,
  currency       text,
  rate_at_time   numeric,
  unit_cost_base numeric,
  base_currency  text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fifo_open
  ON public.fifo_layers (stock_item_id, received_at) WHERE qty_remaining > 0;

CREATE TABLE IF NOT EXISTS public.fifo_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  movement_id   uuid NOT NULL REFERENCES public.stock_movements(id) ON DELETE CASCADE,
  layer_id      uuid REFERENCES public.fifo_layers(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty           numeric NOT NULL CHECK (qty > 0),
  unit_cost     numeric NOT NULL DEFAULT 0,
  currency      text,
  cost          numeric NOT NULL DEFAULT 0,
  cost_base     numeric NOT NULL DEFAULT 0,
  base_currency text,
  is_uncovered  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.fifo_allocations.is_uncovered IS
  'true = katman yetmedi, maliyet son bilinen birim fiyattan tahmin edildi (gizlenmez).';

CREATE INDEX IF NOT EXISTS ix_fifo_alloc_mv ON public.fifo_allocations(movement_id);
CREATE INDEX IF NOT EXISTS ix_fifo_alloc_item ON public.fifo_allocations(stock_item_id, created_at);

ALTER TABLE public.fifo_layers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fifo_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users read fifo layers" ON public.fifo_layers;
CREATE POLICY "Lab users read fifo layers" ON public.fifo_layers
  FOR SELECT USING (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users read fifo allocations" ON public.fifo_allocations;
CREATE POLICY "Lab users read fifo allocations" ON public.fifo_allocations
  FOR SELECT USING (is_lab_user() AND lab_id = get_my_lab_id());

CREATE OR REPLACE FUNCTION public.fifo_apply_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_dir int; v_qty numeric; v_need numeric; v_take numeric;
  v_item_unit text; L record; v_last_cost numeric; v_cost numeric; v_rate numeric;
BEGIN
  IF NEW.item_id IS NULL OR COALESCE(NEW.is_reversed,false) THEN RETURN NULL; END IF;

  SELECT unit, COALESCE(unit_cost,0) INTO v_item_unit, v_last_cost
    FROM public.stock_items WHERE id = NEW.item_id;

  v_qty := public.convert_qty(NEW.quantity, NEW.unit, v_item_unit);
  IF v_qty IS NULL OR v_qty = 0 THEN RETURN NULL; END IF;

  v_dir := CASE upper(COALESCE(NEW.type,''))
             WHEN 'IN' THEN 1 WHEN 'RETURN' THEN 1 WHEN 'ADJUST' THEN 1
             WHEN 'OUT' THEN -1 WHEN 'WASTE' THEN -1 ELSE 0 END;
  IF v_dir = 0 THEN RETURN NULL; END IF;
  IF v_dir > 0 AND v_qty < 0 THEN v_dir := -1; v_qty := abs(v_qty); END IF;

  IF v_dir > 0 THEN
    v_rate := COALESCE(NEW.rate_at_time, 1);
    INSERT INTO public.fifo_layers (
      lab_id, stock_item_id, movement_id, lot_no, expiry_date,
      qty_in, qty_remaining, unit, unit_cost, currency, rate_at_time,
      unit_cost_base, base_currency, received_at
    ) VALUES (
      NEW.lab_id, NEW.item_id, NEW.id, NEW.lot_no, NEW.expiry_date,
      v_qty, v_qty, v_item_unit, COALESCE(NEW.unit_cost_at_time,0), NEW.currency,
      v_rate, COALESCE(NEW.unit_cost_at_time,0) * v_rate,
      NEW.base_currency_at_time, NEW.created_at
    );
    RETURN NULL;
  END IF;

  v_need := abs(v_qty);
  FOR L IN
    SELECT * FROM public.fifo_layers
     WHERE stock_item_id = NEW.item_id AND qty_remaining > 0
     ORDER BY received_at, created_at FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(L.qty_remaining, v_need);
    v_cost := v_take * L.unit_cost;
    INSERT INTO public.fifo_allocations (
      lab_id, movement_id, layer_id, stock_item_id, qty, unit_cost, currency,
      cost, cost_base, base_currency
    ) VALUES (
      NEW.lab_id, NEW.id, L.id, NEW.item_id, v_take, L.unit_cost, L.currency,
      v_cost, v_cost * COALESCE(L.rate_at_time, 1), L.base_currency
    );
    UPDATE public.fifo_layers SET qty_remaining = qty_remaining - v_take WHERE id = L.id;
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    v_rate := COALESCE(NEW.rate_at_time, 1);
    v_cost := v_need * COALESCE(NEW.unit_cost_at_time, v_last_cost, 0);
    INSERT INTO public.fifo_allocations (
      lab_id, movement_id, layer_id, stock_item_id, qty, unit_cost, currency,
      cost, cost_base, base_currency, is_uncovered
    ) VALUES (
      NEW.lab_id, NEW.id, NULL, NEW.item_id, v_need,
      COALESCE(NEW.unit_cost_at_time, v_last_cost, 0), NEW.currency,
      v_cost, v_cost * v_rate, NEW.base_currency_at_time, true
    );
  END IF;

  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS trg_fifo_apply ON public.stock_movements;
CREATE TRIGGER trg_fifo_apply
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fifo_apply_movement();
