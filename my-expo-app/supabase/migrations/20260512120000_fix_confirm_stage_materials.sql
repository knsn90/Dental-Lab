-- ============================================================
-- 20260512120000 — confirm_stage_materials yeniden tanımla
--
-- Bug: stock_movements.item_id (UUID) içine cast'siz TEXT ekleniyordu.
-- Çözüm: explicit UUID cast + temiz INSERT + opsiyonel stok düşümü.
-- p_advance_stage TRUE ise aşamayı tamamlandı'ya çekip sıradakini aktif eder.
-- ============================================================

DROP FUNCTION IF EXISTS public.confirm_stage_materials(uuid, jsonb, boolean);

CREATE FUNCTION public.confirm_stage_materials(
  p_stage_id       UUID,
  p_lines          JSONB,
  p_advance_stage  BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_work_order   UUID;
  v_lab_id       UUID;
  v_user_type    TEXT; v_role TEXT;
  v_stage_status stage_status;
  v_stage_name   TEXT;
  v_line         JSONB;
  v_item_id      UUID;
  v_qty          NUMERIC;
  v_waste        NUMERIC;
  v_unit_cost    NUMERIC;
  v_unit         TEXT;
  v_name         TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT os.work_order_id, os.status, ls.name
    INTO v_work_order, v_stage_status, v_stage_name
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.id = p_stage_id;
  IF v_work_order IS NULL THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = v_work_order;
  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;

  -- Yetki: teknisyen kendi aktif aşaması veya manager/admin
  IF NOT (
    v_user_type = 'admin'
    OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))
    OR EXISTS (SELECT 1 FROM public.order_stages WHERE id = p_stage_id AND technician_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Her satır: stock_movement OUT + stok düşür
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_item_id   := NULLIF(v_line->>'item_id', '')::UUID;
    v_qty       := COALESCE((v_line->>'actual_qty')::NUMERIC, 0);
    v_waste     := COALESCE((v_line->>'waste_qty')::NUMERIC,  0);
    v_unit_cost := COALESCE((v_line->>'unit_cost')::NUMERIC,  0);
    v_unit      := v_line->>'unit';
    v_name      := v_line->>'item_name';

    IF v_item_id IS NULL THEN CONTINUE; END IF;
    IF (v_qty + v_waste) <= 0 THEN CONTINUE; END IF;

    -- OUT (tüketim)
    IF v_qty > 0 THEN
      INSERT INTO public.stock_movements (
        lab_id, item_id, item_name, type, quantity, unit,
        unit_cost_at_time, note, source, user_id, order_id
      ) VALUES (
        v_lab_id, v_item_id, v_name, 'OUT', v_qty, v_unit,
        v_unit_cost,
        COALESCE(v_line->>'note', v_stage_name),
        'stage-consumption', v_caller, v_work_order
      );
      UPDATE public.stock_items
         SET quantity   = quantity - v_qty,
             updated_at = NOW()
       WHERE id = v_item_id;
    END IF;

    -- WASTE (fire)
    IF v_waste > 0 THEN
      INSERT INTO public.stock_movements (
        lab_id, item_id, item_name, type, quantity, unit,
        unit_cost_at_time, note, source, user_id, order_id
      ) VALUES (
        v_lab_id, v_item_id, v_name, 'WASTE', v_waste, v_unit,
        v_unit_cost,
        COALESCE(v_line->>'waste_reason', 'fire'),
        'stage-consumption', v_caller, v_work_order
      );
      UPDATE public.stock_items
         SET quantity   = quantity - v_waste,
             updated_at = NOW()
       WHERE id = v_item_id;
    END IF;
  END LOOP;

  -- Aşamayı ilerlet
  IF p_advance_stage AND v_stage_status = 'aktif' THEN
    PERFORM public.complete_stage_simple(p_stage_id);
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_stage_materials(UUID, JSONB, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
