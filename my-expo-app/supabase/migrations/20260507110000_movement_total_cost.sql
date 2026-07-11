-- ============================================================
-- 20260507 — create_stock_movement_with_snapshot total_cost güncellemesi
--
-- Phase 2'deki RPC'ye total_cost_at_time + total_cost_base_at_time
-- snapshot'ı ekler. Her movement INSERT'inde precomputed kaydedilir.
-- ============================================================

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
  v_total_orig    numeric;
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

  -- Snapshot computations
  IF p_unit_cost_at_time IS NOT NULL THEN
    v_base_cost := p_unit_cost_at_time * COALESCE(v_rate, 1);
    v_total_orig := p_quantity * p_unit_cost_at_time;
    v_total_base := p_quantity * v_base_cost;
  END IF;

  INSERT INTO public.stock_movements (
    lab_id, item_id, item_name, type, quantity, unit,
    unit_cost_at_time, currency, rate_at_time,
    unit_cost_base_at_time, base_currency_at_time,
    total_cost_at_time, total_cost_base_at_time,
    order_id, note, source, stage, user_id, supplier_id
  ) VALUES (
    p_lab_id, p_item_id, p_item_name, p_type, p_quantity, p_unit,
    p_unit_cost_at_time, p_currency, COALESCE(v_rate, 1),
    v_base_cost, v_base_currency,
    v_total_orig, v_total_base,
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
    INSERT INTO public.supplier_transactions (
      lab_id, supplier_id, type, amount, currency,
      rate_at_time, amount_base, base_currency_at_time,
      related_movement_id, invoice_no, payment_method,
      description, transaction_date, due_date, created_by
    ) VALUES (
      p_lab_id, p_supplier_id, 'PURCHASE', v_total_orig, p_currency,
      COALESCE(v_rate, 1), v_total_base, v_base_currency,
      v_movement_id, p_invoice_no, p_payment_method,
      p_item_name || ' — ' || p_quantity::text || ' ' || COALESCE(p_unit, '') || ' alımı',
      CURRENT_DATE, p_due_date, auth.uid()
    );
  END IF;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;
