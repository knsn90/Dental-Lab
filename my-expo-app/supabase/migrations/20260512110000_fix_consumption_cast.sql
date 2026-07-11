-- Re-create record_stage_consumption with explicit UUID casts.
-- Symptom: "column item_id is of type uuid but expression is of type text"
-- on stock_movements insert during stage material approval.

CREATE OR REPLACE FUNCTION public.record_stage_consumption(
  p_work_order_id UUID,
  p_stage         TEXT,
  p_items         JSONB,   -- [{item_id, quantity}]
  p_user_id       UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item       JSONB;
  v_item_id  UUID;
  v_qty      NUMERIC;
  v_lab_id   UUID;
BEGIN
  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_work_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (item->>'item_id')::UUID;
    v_qty     := (item->>'quantity')::NUMERIC;
    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.stock_movements (
      lab_id, item_id, order_id, type, quantity, note, source, user_id
    ) VALUES (
      v_lab_id, v_item_id, p_work_order_id, 'OUT', v_qty,
      p_stage, 'stage-consumption', p_user_id
    );

    UPDATE public.stock_items
       SET quantity   = quantity - v_qty,
           updated_at = NOW()
     WHERE id = v_item_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_stage_consumption(UUID, TEXT, JSONB, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
