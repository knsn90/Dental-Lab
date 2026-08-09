-- ============================================================================
-- Alış girişinde lot / son kullanma tarihi
--
-- create_purchase_invoice satır JSON'una iki opsiyonel alan eklendi:
--   lines[].lot_no       → stock_movements.lot_no
--   lines[].expiry_date  → stock_movements.expiry_date  (YYYY-MM-DD)
--
-- Fonksiyonun geri kalanı DEĞİŞMEDİ (imza aynı → grant'lar korunur).
-- Alanlar opsiyonel; girilmezse bugünkü davranışın birebir aynısı.
-- Gerekçe: lot/SKT geri kazanılamayan veridir — bugün toplanmazsa yarın
-- türetilemez (izlenebilirlik / klinik şikâyet takibi).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_purchase_invoice(
  p_lab_id uuid, p_supplier_id uuid, p_supplier_name text, p_invoice_number text,
  p_invoice_date date, p_due_date date, p_currency text, p_vat_rate numeric,
  p_payment_method text, p_invoice_file_url text, p_notes text, p_lines jsonb,
  p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_base_currency text; v_rate numeric; v_subtotal numeric := 0; v_subtotal_base numeric := 0;
  v_vat_amount numeric := 0; v_total numeric; v_total_base numeric; v_invoice_id uuid; v_line jsonb;
  v_qty numeric; v_unit_price numeric; v_line_total numeric; v_line_total_base numeric; v_unit_price_base numeric;
  v_item_id text; v_existing_item_id uuid; v_line_count int; v_brand_name text; v_category_name text;
  v_kind text; v_eq_category text; v_line_vat_rate numeric; v_line_vat_amount numeric;
  v_distinct_vat_rates int; v_header_vat_rate numeric;
  v_lot text; v_expiry date;
BEGIN
  SELECT default_currency INTO v_base_currency FROM public.lab_settings WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;
  IF p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN v_rate := p_exchange_rate;
  ELSE
    v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_invoice_date);
    IF v_rate IS NULL AND p_currency <> v_base_currency THEN RAISE EXCEPTION 'Currency rate not defined for % -> % on % — fatura kurunu manuel gir', p_currency, v_base_currency, p_invoice_date; END IF;
    IF v_rate IS NULL THEN v_rate := 1; END IF;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric,0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric,0);
    v_line_total := v_qty * v_unit_price;
    v_line_vat_rate := COALESCE((v_line->>'vat_rate')::numeric, p_vat_rate, 0);
    v_line_vat_amount := v_line_total * v_line_vat_rate / 100;
    v_subtotal := v_subtotal + v_line_total; v_vat_amount := v_vat_amount + v_line_vat_amount;
  END LOOP;
  v_subtotal_base := v_subtotal * v_rate; v_total := v_subtotal + v_vat_amount; v_total_base := v_total * v_rate;
  v_line_count := jsonb_array_length(p_lines);

  SELECT COUNT(DISTINCT COALESCE((l->>'vat_rate')::numeric, p_vat_rate, 0)) INTO v_distinct_vat_rates FROM jsonb_array_elements(p_lines) l;
  IF v_distinct_vat_rates = 1 THEN
    SELECT COALESCE((l->>'vat_rate')::numeric, p_vat_rate, 0) INTO v_header_vat_rate FROM jsonb_array_elements(p_lines) l LIMIT 1;
  ELSE v_header_vat_rate := NULL; END IF;

  INSERT INTO public.purchase_invoices (
    lab_id,supplier_id,supplier_name,invoice_number,invoice_date,due_date,invoice_file_url,notes,
    currency,rate_at_time,base_currency_at_time,subtotal,vat_rate,vat_amount,total,
    subtotal_base,vat_amount_base,total_base,payment_method,created_by
  ) VALUES (
    p_lab_id,p_supplier_id,p_supplier_name,p_invoice_number,p_invoice_date,p_due_date,p_invoice_file_url,p_notes,
    p_currency,v_rate,v_base_currency,v_subtotal,v_header_vat_rate,v_vat_amount,v_total,
    v_subtotal_base,v_vat_amount*v_rate,v_total_base,p_payment_method,auth.uid()
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric,0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric,0);
    v_unit_price_base := v_unit_price * v_rate;
    v_line_total := v_qty * v_unit_price; v_line_total_base := v_line_total * v_rate;
    v_line_vat_rate := COALESCE((v_line->>'vat_rate')::numeric, p_vat_rate, 0);
    v_line_vat_amount := v_line_total * v_line_vat_rate / 100;
    v_item_id := NULLIF(v_line->>'item_id','');
    v_brand_name := NULLIF(TRIM(v_line->>'brand'),'');
    v_category_name := NULLIF(TRIM(v_line->>'category'),'');
    v_kind := COALESCE(NULLIF(LOWER(v_line->>'item_kind'),''),'consumable');
    -- YENİ: lot / son kullanma (opsiyonel)
    v_lot := NULLIF(TRIM(v_line->>'lot_no'),'');
    BEGIN
      v_expiry := NULLIF(TRIM(v_line->>'expiry_date'),'')::date;
    EXCEPTION WHEN others THEN
      v_expiry := NULL;   -- hatalı tarih formatı faturayı düşürmesin
    END;

    IF v_brand_name IS NOT NULL THEN
      INSERT INTO public.brands (lab_id, name) SELECT p_lab_id, v_brand_name
      WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE lab_id=p_lab_id AND LOWER(name)=LOWER(v_brand_name));
    END IF;

    IF v_kind = 'equipment' THEN
      v_eq_category := COALESCE(LOWER(NULLIF(TRIM(v_line->>'equipment_category'),'')),'other');
      IF v_eq_category NOT IN ('cad_cam','scanner','furnace','milling','printer','sintering','polishing','articulator','compressor','other') THEN v_eq_category := 'other'; END IF;
      FOR i IN 1..GREATEST(1, FLOOR(v_qty)::int) LOOP
        INSERT INTO public.equipment (lab_id,name,brand,model,category,status,purchase_date,notes)
        VALUES (p_lab_id, TRIM(v_line->>'item_name'), v_brand_name, NULLIF(TRIM(v_line->>'model'),''), v_eq_category,'active',p_invoice_date,
          format('Fatura: %s · birim fiyat: %s %s · KDV %%%s', COALESCE(p_invoice_number,'—'), v_unit_price, p_currency, v_line_vat_rate));
      END LOOP;
      CONTINUE;
    END IF;

    IF v_category_name IS NOT NULL THEN
      INSERT INTO public.categories (lab_id, name) SELECT p_lab_id, v_category_name
      WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE lab_id=p_lab_id AND LOWER(name)=LOWER(v_category_name));
    END IF;

    IF v_item_id IS NULL THEN
      SELECT id INTO v_existing_item_id FROM public.stock_items WHERE lab_id=p_lab_id AND LOWER(name)=LOWER(TRIM(v_line->>'item_name')) LIMIT 1;
      IF v_existing_item_id IS NOT NULL THEN
        v_item_id := v_existing_item_id::text;
        IF v_brand_name IS NOT NULL THEN UPDATE public.stock_items SET brand=v_brand_name WHERE id=v_existing_item_id AND (brand IS NULL OR brand=''); END IF;
        IF v_category_name IS NOT NULL THEN UPDATE public.stock_items SET category=v_category_name WHERE id=v_existing_item_id AND (category IS NULL OR category=''); END IF;
      ELSE
        INSERT INTO public.stock_items (lab_id,name,quantity,min_quantity,unit,unit_cost,default_purchase_currency,last_unit_cost_currency,usage_category,is_active,brand,category)
        VALUES (p_lab_id, TRIM(v_line->>'item_name'),0,0,NULLIF(v_line->>'unit',''),v_unit_price,p_currency,p_currency,'misc',TRUE,v_brand_name,v_category_name)
        RETURNING id::text INTO v_item_id;
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      lab_id,item_id,item_name,type,quantity,unit,unit_cost_at_time,currency,rate_at_time,
      unit_cost_base_at_time,base_currency_at_time,total_cost_at_time,total_cost_base_at_time,
      note,source,user_id,supplier_id,purchase_invoice_id,vat_rate,vat_amount,lot_no,expiry_date
    ) VALUES (
      p_lab_id,v_item_id::uuid,v_line->>'item_name','IN',v_qty,v_line->>'unit',v_unit_price,p_currency,v_rate,
      v_unit_price_base,v_base_currency,v_line_total,v_line_total_base,
      p_invoice_number,'purchase',auth.uid(),p_supplier_id,v_invoice_id,v_line_vat_rate,v_line_vat_amount,v_lot,v_expiry
    );

    -- quantity: trg_stock_qty_sync (birim-dönüşümlü). unit_cost/currency korunur:
    UPDATE public.stock_items SET unit_cost=v_unit_price, last_unit_cost_currency=p_currency, updated_at=NOW() WHERE id=v_item_id::uuid;
  END LOOP;

  IF p_supplier_id IS NOT NULL THEN
    INSERT INTO public.supplier_transactions (lab_id,supplier_id,type,amount,currency,rate_at_time,amount_base,base_currency_at_time,invoice_no,payment_method,description,transaction_date,due_date,created_by)
    VALUES (p_lab_id,p_supplier_id,'PURCHASE',v_total,p_currency,v_rate,v_total_base,v_base_currency,p_invoice_number,p_payment_method,
      'Fatura: ' || COALESCE(p_invoice_number,'#') || ' (' || v_line_count::text || ' kalem)', p_invoice_date,p_due_date,auth.uid());
  END IF;
  RETURN v_invoice_id;
END; $function$;
