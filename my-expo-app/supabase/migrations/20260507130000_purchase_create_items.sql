-- ============================================================
-- 20260507 — Purchase invoice: yeni ürünleri stock_items'a otomatik ekle
--
-- Önceki RPC (create_purchase_invoice) sadece mevcut item_id verilen
-- satırlarda stock_items.quantity artırıyordu. Yeni ürün satırları
-- (item_id NULL) sadece stock_movements kaydı oluşturuyor, ama
-- stock_items'a INSERT etmiyordu → ürün listesinde görünmüyordu.
--
-- Bu güncelleme: item_id NULL olan satırlarda yeni stock_item INSERT
-- edilir, dönen id ile movement kaydedilir.
-- ============================================================

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
BEGIN
  -- Lab base currency + kur
  SELECT default_currency INTO v_base_currency FROM public.lab_settings WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_invoice_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> % on %', p_currency, v_base_currency, p_invoice_date;
  END IF;
  IF v_rate IS NULL THEN v_rate := 1; END IF;

  -- Subtotal hesabı
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

  -- Header
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
    v_item_id := NULLIF(v_line->>'item_id', '');

    -- ── YENİ: Eğer item_id yoksa → mevcut bir ürünü ada göre bul,
    --     yoksa yeni stock_items kaydı oluştur ──
    IF v_item_id IS NULL THEN
      -- Aynı isimde mevcut ürün var mı? (case-insensitive)
      SELECT id INTO v_existing_item_id
      FROM public.stock_items
      WHERE lab_id = p_lab_id
        AND LOWER(name) = LOWER(TRIM(v_line->>'item_name'))
      LIMIT 1;

      IF v_existing_item_id IS NOT NULL THEN
        v_item_id := v_existing_item_id::text;
      ELSE
        -- YENİ ürün oluştur
        INSERT INTO public.stock_items (
          lab_id, name, quantity, min_quantity,
          unit, unit_cost, default_purchase_currency, last_unit_cost_currency,
          usage_category, is_active
        ) VALUES (
          p_lab_id,
          TRIM(v_line->>'item_name'),
          0,                                 -- başlangıç 0; movement quantity'i artıracak
          0,
          NULLIF(v_line->>'unit', ''),
          v_unit_price,
          p_currency,
          p_currency,
          'misc',                            -- default; kullanıcı sonradan düzenleyebilir
          TRUE
        )
        RETURNING id::text INTO v_item_id;
      END IF;
    END IF;

    -- Stock movement
    INSERT INTO public.stock_movements (
      lab_id, item_id, item_name, type, quantity, unit,
      unit_cost_at_time, currency, rate_at_time,
      unit_cost_base_at_time, base_currency_at_time,
      total_cost_at_time, total_cost_base_at_time,
      note, source, user_id, supplier_id, purchase_invoice_id
    ) VALUES (
      p_lab_id,
      v_item_id,
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

    -- stock_items.quantity artır + last_unit_cost güncelle (her durumda)
    UPDATE public.stock_items
    SET quantity = quantity + v_qty,
        unit_cost = v_unit_price,
        last_unit_cost_currency = p_currency,
        updated_at = NOW()
    WHERE id::text = v_item_id;
  END LOOP;

  -- Cari hesap PURCHASE
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
-- ✓ Yeni ürünler stock_items'a otomatik kaydedilir:
--   • item_id NULL ise: önce isimden mevcut ürünü ara
--   • Bulunmazsa yeni stock_items kaydı oluştur (qty=0, sonra artır)
--   • Movement her zaman gerçek item_id ile kaydedilir
--   • unit_cost ilk alıştan otomatik dolar
-- ============================================================
