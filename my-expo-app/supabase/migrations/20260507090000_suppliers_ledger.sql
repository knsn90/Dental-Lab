-- ============================================================
-- 20260507 — Tedarikçiler & Cari Hesap (supplier ledger)
--
-- Mimari:
--   • suppliers: firma bilgileri (ad, vergi no, iletişim, default currency)
--   • supplier_transactions: cari hesap hareketleri
--     - type='PURCHASE'   → borç oluşur (pozitif amount)
--     - type='PAYMENT'    → borç düşer (NEGATİF amount)
--     - type='RETURN'     → iade (negatif amount)
--     - type='ADJUSTMENT' → manuel düzeltme
--   • Cari bakiye = SUM(amount_base) per supplier
--   • Stock movement IN'a supplier_id eklenir → otomatik PURCHASE
--
-- brands tablosundan farkı:
--   brands = ürün markası (3M, Ivoclar)
--   suppliers = satıcı firma (ABC Dental Tic.)
--   Bir marka birden çok firmadan alınabilir, bir firma birden çok marka satar.
-- ============================================================

-- ── 1. suppliers tablosu ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,

  name            text NOT NULL,
  contact_person  text,
  phone           text,
  email           text,
  website         text,
  address         text,
  tax_no          text,                   -- VKN / TCKN
  tax_office      text,                   -- vergi dairesi
  iban            text,
  bank_name       text,

  category        text DEFAULT 'material' -- 'material' | 'equipment' | 'service' | 'other'
                  CHECK (category IN ('material','equipment','service','other')),
  default_currency text DEFAULT 'TRY'
                   CHECK (default_currency IN ('TRY','EUR','USD','GBP')),
  payment_terms_days int DEFAULT 0,       -- 0=peşin, 30=30 gün vade vb.

  notes           text,
  is_active       boolean NOT NULL DEFAULT TRUE,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_lab     ON public.suppliers(lab_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active  ON public.suppliers(lab_id, is_active);

-- RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_read"  ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;

CREATE POLICY "suppliers_read"
  ON public.suppliers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = suppliers.lab_id OR p.user_type = 'admin')
    )
  );

CREATE POLICY "suppliers_write"
  ON public.suppliers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin'
             OR (p.user_type = 'lab' AND p.lab_id = suppliers.lab_id))
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.suppliers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_updated_at();

-- ── 2. supplier_transactions tablosu ────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,

  type            text NOT NULL
                  CHECK (type IN ('PURCHASE','PAYMENT','RETURN','ADJUSTMENT')),
  -- PURCHASE: + (borç)   PAYMENT: - (alacak)   RETURN: -   ADJUSTMENT: ±
  amount          numeric NOT NULL,
  currency        text NOT NULL DEFAULT 'TRY'
                  CHECK (currency IN ('TRY','EUR','USD','GBP')),

  -- Snapshot (Phase 3 deseni)
  rate_at_time           numeric(18,6) DEFAULT 1,
  amount_base            numeric,
  base_currency_at_time  text DEFAULT 'TRY',

  -- Referans alanları
  related_movement_id  uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  invoice_no           text,                       -- fatura numarası
  payment_method       text,                       -- 'cash' | 'transfer' | 'check' | 'card'

  description          text,
  transaction_date     date NOT NULL DEFAULT CURRENT_DATE,
  due_date             date,                        -- vade tarihi (varsa)

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_tx_supplier
  ON public.supplier_transactions(supplier_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_tx_lab_date
  ON public.supplier_transactions(lab_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_tx_movement
  ON public.supplier_transactions(related_movement_id) WHERE related_movement_id IS NOT NULL;

-- RLS
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_tx_read"  ON public.supplier_transactions;
DROP POLICY IF EXISTS "supplier_tx_write" ON public.supplier_transactions;

CREATE POLICY "supplier_tx_read"
  ON public.supplier_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = supplier_transactions.lab_id OR p.user_type = 'admin')
    )
  );

CREATE POLICY "supplier_tx_write"
  ON public.supplier_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin'
             OR (p.user_type = 'lab' AND p.lab_id = supplier_transactions.lab_id))
    )
  );

-- ── 3. stock_movements'a supplier_id ekle ───────────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier
  ON public.stock_movements(supplier_id) WHERE supplier_id IS NOT NULL;

-- ── 4. View: cari bakiye hesapla ────────────────────────────
-- Tüm tedarikçilerin güncel bakiyesini base currency cinsinden döner.
-- Pozitif bakiye = bizim borcumuz, negatif bakiye = bizim alacağımız.
CREATE OR REPLACE VIEW public.supplier_balances AS
SELECT
  s.id                AS supplier_id,
  s.lab_id,
  s.name,
  s.default_currency,
  COALESCE(SUM(st.amount_base), 0)  AS balance_base,
  COALESCE(SUM(CASE WHEN st.type = 'PURCHASE'  THEN st.amount_base ELSE 0 END), 0) AS total_purchases,
  COALESCE(SUM(CASE WHEN st.type = 'PAYMENT'   THEN -st.amount_base ELSE 0 END), 0) AS total_payments,
  COALESCE(SUM(CASE WHEN st.type = 'RETURN'    THEN -st.amount_base ELSE 0 END), 0) AS total_returns,
  COUNT(st.id) FILTER (WHERE st.type = 'PURCHASE') AS purchase_count,
  MAX(st.transaction_date)          AS last_transaction_date
FROM public.suppliers s
LEFT JOIN public.supplier_transactions st ON st.supplier_id = s.id
GROUP BY s.id, s.lab_id, s.name, s.default_currency;

-- ── 5. RPC: stok girişi sırasında tedarikçi cari kaydı ──────
-- create_stock_movement_with_snapshot fonksiyonunu güncelle:
-- supplier_id verilirse + IN ise + cost varsa → otomatik PURCHASE transaction yarat.
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
  p_stage            text DEFAULT NULL,
  p_supplier_id      uuid DEFAULT NULL,
  p_invoice_no       text DEFAULT NULL,
  p_payment_method   text DEFAULT NULL,
  p_due_date         date DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_base_currency text;
  v_rate          numeric;
  v_base_cost     numeric;
  v_total_amount  numeric;
  v_total_base    numeric;
  v_movement_id   uuid;
BEGIN
  -- Lab base currency
  SELECT default_currency INTO v_base_currency
  FROM public.lab_settings
  WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  -- Kur snapshot
  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, CURRENT_DATE);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> % on %',
      p_currency, v_base_currency, CURRENT_DATE
      USING ERRCODE = 'P0001';
  END IF;

  IF p_unit_cost_at_time IS NOT NULL THEN
    v_base_cost := p_unit_cost_at_time * COALESCE(v_rate, 1);
  END IF;

  -- Stock movement
  INSERT INTO public.stock_movements (
    lab_id, item_id, item_name, type, quantity, unit,
    unit_cost_at_time, currency, rate_at_time,
    unit_cost_base_at_time, base_currency_at_time,
    order_id, note, source, stage, user_id, supplier_id
  ) VALUES (
    p_lab_id, p_item_id, p_item_name, p_type, p_quantity, p_unit,
    p_unit_cost_at_time, p_currency, COALESCE(v_rate, 1),
    v_base_cost, v_base_currency,
    p_order_id, p_note, p_source, p_stage, auth.uid(), p_supplier_id
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

  -- IN + supplier_id + cost varsa → cari hesaba PURCHASE düş
  IF p_type = 'IN' AND p_supplier_id IS NOT NULL
     AND p_unit_cost_at_time IS NOT NULL AND p_quantity IS NOT NULL THEN
    v_total_amount := p_quantity * p_unit_cost_at_time;
    v_total_base   := v_total_amount * COALESCE(v_rate, 1);

    INSERT INTO public.supplier_transactions (
      lab_id, supplier_id, type, amount, currency,
      rate_at_time, amount_base, base_currency_at_time,
      related_movement_id, invoice_no, payment_method,
      description, transaction_date, due_date, created_by
    ) VALUES (
      p_lab_id, p_supplier_id, 'PURCHASE', v_total_amount, p_currency,
      COALESCE(v_rate, 1), v_total_base, v_base_currency,
      v_movement_id, p_invoice_no, p_payment_method,
      p_item_name || ' — ' || p_quantity::text || ' ' || COALESCE(p_unit, '') || ' alımı',
      CURRENT_DATE, p_due_date, auth.uid()
    );
  END IF;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ── 6. RPC: ödeme/iade snapshot ile kaydet ──────────────────
CREATE OR REPLACE FUNCTION public.record_supplier_transaction(
  p_lab_id          uuid,
  p_supplier_id     uuid,
  p_type            text,
  p_amount          numeric,
  p_currency        text DEFAULT 'TRY',
  p_payment_method  text DEFAULT NULL,
  p_invoice_no      text DEFAULT NULL,
  p_description     text DEFAULT NULL,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_due_date        date DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_base_currency text;
  v_rate          numeric;
  v_base_amount   numeric;
  v_tx_id         uuid;
BEGIN
  IF p_type NOT IN ('PURCHASE','PAYMENT','RETURN','ADJUSTMENT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type;
  END IF;

  SELECT default_currency INTO v_base_currency
  FROM public.lab_settings
  WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_transaction_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> %', p_currency, v_base_currency;
  END IF;

  v_base_amount := p_amount * COALESCE(v_rate, 1);

  INSERT INTO public.supplier_transactions (
    lab_id, supplier_id, type, amount, currency,
    rate_at_time, amount_base, base_currency_at_time,
    invoice_no, payment_method, description,
    transaction_date, due_date, created_by
  ) VALUES (
    p_lab_id, p_supplier_id, p_type, p_amount, p_currency,
    COALESCE(v_rate, 1), v_base_amount, v_base_currency,
    p_invoice_no, p_payment_method, p_description,
    p_transaction_date, p_due_date, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Tedarikçi cari hesap altyapısı:
--   • suppliers tablosu + RLS + trigger
--   • supplier_transactions (snapshot currency desenli)
--   • stock_movements.supplier_id link
--   • supplier_balances view (cari bakiye hesabı)
--   • create_stock_movement_with_snapshot: supplier_id verilirse otomatik PURCHASE
--   • record_supplier_transaction: ödeme/iade kaydı
-- ============================================================
