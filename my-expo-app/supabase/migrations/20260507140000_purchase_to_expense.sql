-- ============================================================
-- 20260507 — Purchase invoice → otomatik expenses kaydı
--
-- Satın Alma kaydedildiğinde Giderler listesinde de görünsün diye:
--   • category = 'malzeme'
--   • description = "Fatura: <invoice_number> · <line_count> kalem"
--   • amount = total (KDV dahil, orijinal currency)
--   • amount_base = total_base (snapshot TRY)
--   • currency snapshot
--   • payment_method snapshot
--
-- Bu sayede:
--   • Malzeme alımları otomatik giderlere yansır (manuel kayda gerek yok).
--   • Excel export'larında, kategori grafikleri ve toplam giderlerde sayılır.
--   • Çift sayım yok — purchase invoice 1:1 expense ile eşleşir.
--
-- expenses.purchase_invoice_id kolonu eklenir → audit link.
-- ============================================================

-- expenses tablosuna purchase_invoice_id link
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expenses_purchase_invoice
  ON public.expenses(purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;

-- ── RPC update: create_purchase_invoice → expenses INSERT eklenir ──
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
  p_lines           jsonb
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
  v_item_id       text;
  v_existing_item_id uuid;
  v_line_count    int;
BEGIN
  -- Base currency + kur snapshot
  SELECT default_currency INTO v_base_currency FROM public.lab_settings WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_invoice_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> % on %', p_currency, v_base_currency, p_invoice_date;
  END IF;
  IF v_rate IS NULL THEN v_rate := 1; END IF;

  -- Subtotal
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
  v_line_count    := jsonb_array_length(p_lines);

  -- 1) purchase_invoice header
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

  -- 2) Her satır için stock_items + movement
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_unit_price_base := v_unit_price * v_rate;
    v_line_total := v_qty * v_unit_price;
    v_line_total_base := v_line_total * v_rate;
    v_item_id := NULLIF(v_line->>'item_id', '');

    IF v_item_id IS NULL THEN
      SELECT id INTO v_existing_item_id
      FROM public.stock_items
      WHERE lab_id = p_lab_id
        AND LOWER(name) = LOWER(TRIM(v_line->>'item_name'))
      LIMIT 1;

      IF v_existing_item_id IS NOT NULL THEN
        v_item_id := v_existing_item_id::text;
      ELSE
        INSERT INTO public.stock_items (
          lab_id, name, quantity, min_quantity,
          unit, unit_cost, default_purchase_currency, last_unit_cost_currency,
          usage_category, is_active
        ) VALUES (
          p_lab_id, TRIM(v_line->>'item_name'), 0, 0,
          NULLIF(v_line->>'unit', ''),
          v_unit_price, p_currency, p_currency,
          'misc', TRUE
        )
        RETURNING id::text INTO v_item_id;
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      lab_id, item_id, item_name, type, quantity, unit,
      unit_cost_at_time, currency, rate_at_time,
      unit_cost_base_at_time, base_currency_at_time,
      total_cost_at_time, total_cost_base_at_time,
      note, source, user_id, supplier_id, purchase_invoice_id
    ) VALUES (
      p_lab_id, v_item_id, v_line->>'item_name', 'IN',
      v_qty, v_line->>'unit',
      v_unit_price, p_currency, v_rate,
      v_unit_price_base, v_base_currency,
      v_line_total, v_line_total_base,
      p_invoice_number, 'purchase', auth.uid(),
      p_supplier_id, v_invoice_id
    );

    UPDATE public.stock_items
    SET quantity = quantity + v_qty,
        unit_cost = v_unit_price,
        last_unit_cost_currency = p_currency,
        updated_at = NOW()
    WHERE id::text = v_item_id;
  END LOOP;

  -- 3) Cari hesap PURCHASE
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
      'Fatura: ' || COALESCE(p_invoice_number, '#') || ' (' || v_line_count::text || ' kalem)',
      p_invoice_date, p_due_date, auth.uid()
    );
  END IF;

  -- 4) ── YENİ: expenses kaydı (Giderler listesinde görünsün) ──
  INSERT INTO public.expenses (
    lab_id, category, description, amount,
    expense_date, payment_method, notes,
    currency, rate_at_time, amount_base, base_currency_at_time,
    purchase_invoice_id, created_by
  ) VALUES (
    p_lab_id,
    'malzeme',
    'Fatura: ' || COALESCE(p_invoice_number, '#') || ' · ' || p_supplier_name || ' (' || v_line_count::text || ' kalem)',
    v_total,
    p_invoice_date,
    -- expenses.payment_method farklı enum: nakit/kart/havale/cek
    CASE p_payment_method
      WHEN 'cash' THEN 'nakit'
      WHEN 'card' THEN 'kart'
      WHEN 'transfer' THEN 'havale'
      WHEN 'check' THEN 'cek'
      ELSE 'havale'
    END,
    p_notes,
    p_currency, v_rate, v_total_base, v_base_currency,
    v_invoice_id, auth.uid()
  );

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Hazır:
--   • expenses.purchase_invoice_id link kolonu
--   • create_purchase_invoice → expenses INSERT (category=malzeme)
--   • Satın alma faturası kaydedilince Giderler listesinde de görünür
--   • Toplam gider hesaplarına otomatik dahil olur
-- ============================================================
