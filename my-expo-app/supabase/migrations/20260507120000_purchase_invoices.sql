-- ============================================================
-- 20260507 — Purchase Invoices: Material purchasing + inventory intake flow
--
-- "Gider Ekle" tek başına yetmiyor: malzeme alımı stok + maliyet + cari
-- akışlarını da etkiliyor. Ayrı bir purchase_invoices tablosu.
--
-- Akış:
--   1. purchase_invoice header oluşturulur (supplier, fatura no, KDV, total, dosya).
--   2. Her satır için stock_movements IN insert edilir (purchase_invoice_id link'iyle).
--   3. stock_items.quantity artırılır, last_unit_cost güncellenir.
--   4. supplier_transactions PURCHASE düşer (cari hesaba borç).
--   5. expenses tablosuna "Malzeme alımı" ile bir kayıt da eklenir
--      (raporların "gider" tarafında görünmesi için).
--
-- İdempotent.
-- ============================================================

-- ── 1. purchase_invoices tablosu ───────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,

  -- Tedarikçi
  supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name   text NOT NULL,                 -- snapshot (firma adı değişse bile)

  -- Fatura
  invoice_number  text,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  invoice_file_url text,                          -- supabase storage path
  notes           text,

  -- Tutarlar (orijinal currency)
  currency        text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','EUR','USD','GBP')),
  subtotal        numeric NOT NULL DEFAULT 0,     -- KDV hariç toplam
  vat_rate        numeric DEFAULT 20,             -- KDV %
  vat_amount      numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,     -- KDV dahil

  -- Snapshot (Phase 3 deseni)
  rate_at_time    numeric(18,6) DEFAULT 1,
  base_currency_at_time text DEFAULT 'TRY',
  subtotal_base   numeric NOT NULL DEFAULT 0,
  vat_amount_base numeric NOT NULL DEFAULT 0,
  total_base      numeric NOT NULL DEFAULT 0,

  -- Ödeme
  payment_method  text CHECK (payment_method IN ('cash','transfer','check','card','open_account')),

  -- Audit
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_lab_date
  ON public.purchase_invoices(lab_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier
  ON public.purchase_invoices(supplier_id);

-- ── 2. stock_movements'a purchase_invoice_id ───────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice
  ON public.stock_movements(purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;

-- ── 3. RLS ──────────────────────────────────────────────────
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_invoices_read"  ON public.purchase_invoices;
DROP POLICY IF EXISTS "purchase_invoices_write" ON public.purchase_invoices;

CREATE POLICY "purchase_invoices_read"
  ON public.purchase_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = purchase_invoices.lab_id OR p.user_type = 'admin')
    )
  );

CREATE POLICY "purchase_invoices_write"
  ON public.purchase_invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin'
             OR (p.user_type = 'lab' AND p.lab_id = purchase_invoices.lab_id))
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.purchase_invoices_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_invoices_updated_at ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_updated_at
  BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_invoices_updated_at();

-- ── 4. RPC: create_purchase_invoice (transactional) ────────
-- Tek RPC ile fatura header + tüm satırlar atomic insert edilir.
-- p_lines: jsonb array — [{ item_id, item_name, quantity, unit, unit_price }]
CREATE OR REPLACE FUNCTION public.create_purchase_invoice(
  p_lab_id          uuid,
  p_supplier_id     uuid,
  p_supplier_name   text,
  p_invoice_number  text,
  p_invoice_date    date,
  p_due_date        date,
  p_currency        text,
  p_vat_rate        numeric,
  p_payment_method  text,
  p_invoice_file_url text,
  p_notes           text,
  p_lines           jsonb         -- array of line items
)
RETURNS uuid AS $$
DECLARE
  v_base_currency text;
  v_rate          numeric;
  v_subtotal      numeric := 0;
  v_subtotal_base numeric := 0;
  v_vat_amount    numeric;
  v_total         numeric;
  v_total_base    numeric;
  v_invoice_id    uuid;
  v_line          jsonb;
  v_qty           numeric;
  v_unit_price    numeric;
  v_line_total    numeric;
  v_line_total_base numeric;
  v_unit_price_base numeric;
BEGIN
  -- Lab base currency + kur
  SELECT default_currency INTO v_base_currency FROM public.lab_settings WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_invoice_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> % on %', p_currency, v_base_currency, p_invoice_date;
  END IF;
  IF v_rate IS NULL THEN v_rate := 1; END IF;

  -- Subtotal hesabı (line'lardan)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price);
  END LOOP;

  v_subtotal_base := v_subtotal * v_rate;
  v_vat_amount    := v_subtotal * COALESCE(p_vat_rate, 0) / 100;
  v_total         := v_subtotal + v_vat_amount;
  v_total_base    := v_total * v_rate;

  -- Header insert
  INSERT INTO public.purchase_invoices (
    lab_id, supplier_id, supplier_name,
    invoice_number, invoice_date, due_date, invoice_file_url, notes,
    currency, rate_at_time, base_currency_at_time,
    subtotal, vat_rate, vat_amount, total,
    subtotal_base, vat_amount_base, total_base,
    payment_method, created_by
  ) VALUES (
    p_lab_id, p_supplier_id, p_supplier_name,
    p_invoice_number, p_invoice_date, p_due_date, p_invoice_file_url, p_notes,
    p_currency, v_rate, v_base_currency,
    v_subtotal, COALESCE(p_vat_rate, 0), v_vat_amount, v_total,
    v_subtotal_base, v_vat_amount * v_rate, v_total_base,
    p_payment_method, auth.uid()
  )
  RETURNING id INTO v_invoice_id;

  -- Her satır için stock_movements IN
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_unit_price_base := v_unit_price * v_rate;
    v_line_total := v_qty * v_unit_price;
    v_line_total_base := v_line_total * v_rate;

    INSERT INTO public.stock_movements (
      lab_id, item_id, item_name, type, quantity, unit,
      unit_cost_at_time, currency, rate_at_time,
      unit_cost_base_at_time, base_currency_at_time,
      total_cost_at_time, total_cost_base_at_time,
      note, source, user_id, supplier_id, purchase_invoice_id
    ) VALUES (
      p_lab_id,
      (v_line->>'item_id')::text,
      v_line->>'item_name',
      'IN',
      v_qty,
      v_line->>'unit',
      v_unit_price, p_currency, v_rate,
      v_unit_price_base, v_base_currency,
      v_line_total, v_line_total_base,
      p_invoice_number,
      'purchase',
      auth.uid(),
      p_supplier_id,
      v_invoice_id
    );

    -- Stock items quantity artır + last_unit_cost güncelle
    IF (v_line->>'item_id') IS NOT NULL AND (v_line->>'item_id') <> '' THEN
      UPDATE public.stock_items
      SET quantity = quantity + v_qty,
          unit_cost = v_unit_price,
          last_unit_cost_currency = p_currency,
          updated_at = NOW()
      WHERE id::text = (v_line->>'item_id');
    END IF;
  END LOOP;

  -- Cari hesaba PURCHASE düş (toplam fatura tutarı, KDV dahil)
  IF p_supplier_id IS NOT NULL THEN
    INSERT INTO public.supplier_transactions (
      lab_id, supplier_id, type, amount, currency,
      rate_at_time, amount_base, base_currency_at_time,
      invoice_no, payment_method,
      description, transaction_date, due_date, created_by
    ) VALUES (
      p_lab_id, p_supplier_id, 'PURCHASE', v_total, p_currency,
      v_rate, v_total_base, v_base_currency,
      p_invoice_number, p_payment_method,
      'Fatura: ' || COALESCE(p_invoice_number, '#') || ' (' || jsonb_array_length(p_lines)::text || ' kalem)',
      p_invoice_date, p_due_date, auth.uid()
    );
  END IF;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Material purchase / inventory intake hazır:
--   • purchase_invoices header tablosu (multi-line)
--   • stock_movements.purchase_invoice_id link
--   • create_purchase_invoice() RPC: header + lines + stock + cari atomic
--   • RLS lab-scoped + admin override
-- ============================================================
