-- ============================================================
-- 20260718130000 — confirm_stage_materials: paket içeriği + döviz
--
-- Değişiklikler (eski davranışla geriye uyumlu):
--   1. PAKET: item.pack_size doluysa satırın actual_qty/waste_qty'si İÇERİK
--      biriminde (gr) yorumlanır; stoktan kesirli ADET (qty ÷ pack_size) düşer.
--      pack_size NULL → bugünkü birebir düşüm.
--   2. DÖVİZ: maliyet + para birimi kalemin kendisinden (authoritative) okunur;
--      stock_movements'a currency + rate_at_time + base alanları yazılır
--      (get_snapshot_rate). EUR kalem artık TRY'ye düşmez.
--   3. GÜVENLİK: stok düşümü UPDATE ... AND lab_id = v_lab_id (başka lab stoğuna
--      dokunulamaz). Kalem bulunamaz/lab uyuşmazsa satır atlanır.
--
-- Tek-şerit / paketsiz / TRY kalemde sonuç bugünküyle birebir aynıdır.
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
  v_qty          NUMERIC;   -- client'tan gelen tüketim (paketli ise gr, değilse adet)
  v_waste        NUMERIC;
  -- Kalemden okunan otoriter alanlar
  v_item_unit    TEXT;
  v_pack         NUMERIC;
  v_item_cost    NUMERIC;
  v_ccy          TEXT;
  -- Türetilen
  v_deduct       NUMERIC;   -- stok biriminde (adet) düşülecek miktar
  v_deduct_waste NUMERIC;
  v_rate         NUMERIC;
  v_base         TEXT;
  v_note         TEXT;
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

  -- Her satır: stock_movement OUT/WASTE + stok düşür
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_item_id := NULLIF(v_line->>'item_id', '')::UUID;
    v_qty     := COALESCE((v_line->>'actual_qty')::NUMERIC, 0);
    v_waste   := COALESCE((v_line->>'waste_qty')::NUMERIC,  0);

    IF v_item_id IS NULL THEN CONTINUE; END IF;
    IF (v_qty + v_waste) <= 0 THEN CONTINUE; END IF;

    -- Kalemi otoriter oku (lab guard: yalnız kendi labının kalemi)
    SELECT unit, pack_size, COALESCE(unit_cost, 0),
           COALESCE(NULLIF(last_unit_cost_currency, ''),
                    NULLIF(default_purchase_currency, ''), 'TRY')
      INTO v_item_unit, v_pack, v_item_cost, v_ccy
      FROM public.stock_items
     WHERE id = v_item_id AND lab_id = v_lab_id;

    -- Kalem bulunamadı / başka lab → satırı atla (güvenli)
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Paketli kalem: client miktarı içerik biriminde (gr) → adet'e çevir
    IF v_pack IS NOT NULL AND v_pack > 0 THEN
      v_deduct       := v_qty   / v_pack;
      v_deduct_waste := v_waste / v_pack;
    ELSE
      v_deduct       := v_qty;
      v_deduct_waste := v_waste;
    END IF;

    -- Kur snapshot (native → lab base)
    SELECT gsr.rate, gsr.base_currency INTO v_rate, v_base
      FROM public.get_snapshot_rate(v_lab_id, v_ccy) gsr;
    v_rate := COALESCE(v_rate, 1);
    v_base := COALESCE(v_base, 'TRY');

    -- OUT (tüketim)
    IF v_qty > 0 THEN
      v_note := COALESCE(v_line->>'note', v_stage_name);
      IF v_pack IS NOT NULL AND v_pack > 0 THEN
        v_note := v_qty || ' ' || COALESCE(v_line->>'unit','') || ' · ' || v_note;
      END IF;

      INSERT INTO public.stock_movements (
        lab_id, item_id, item_name, type, quantity, unit,
        unit_cost_at_time, currency, rate_at_time,
        unit_cost_base_at_time, base_currency_at_time,
        total_cost_at_time, total_cost_base_at_time,
        note, source, user_id, order_id, stage, stage_id
      ) VALUES (
        v_lab_id, v_item_id, v_line->>'item_name', 'OUT', v_deduct, v_item_unit,
        v_item_cost, v_ccy, v_rate,
        v_item_cost * v_rate, v_base,
        v_deduct * v_item_cost, v_deduct * v_item_cost * v_rate,
        v_note, 'stage-consumption', v_caller, v_work_order, v_stage_name, p_stage_id
      );
      UPDATE public.stock_items
         SET quantity = quantity - v_deduct, updated_at = NOW()
       WHERE id = v_item_id AND lab_id = v_lab_id;
    END IF;

    -- WASTE (fire)
    IF v_waste > 0 THEN
      v_note := COALESCE(v_line->>'waste_reason', 'fire');
      IF v_pack IS NOT NULL AND v_pack > 0 THEN
        v_note := v_waste || ' ' || COALESCE(v_line->>'unit','') || ' · ' || v_note;
      END IF;

      INSERT INTO public.stock_movements (
        lab_id, item_id, item_name, type, quantity, unit,
        unit_cost_at_time, currency, rate_at_time,
        unit_cost_base_at_time, base_currency_at_time,
        total_cost_at_time, total_cost_base_at_time,
        note, source, user_id, order_id, stage, stage_id, waste_reason
      ) VALUES (
        v_lab_id, v_item_id, v_line->>'item_name', 'WASTE', v_deduct_waste, v_item_unit,
        v_item_cost, v_ccy, v_rate,
        v_item_cost * v_rate, v_base,
        v_deduct_waste * v_item_cost, v_deduct_waste * v_item_cost * v_rate,
        v_note, 'stage-consumption', v_caller, v_work_order, v_stage_name, p_stage_id,
        v_line->>'waste_reason'
      );
      UPDATE public.stock_items
         SET quantity = quantity - v_deduct_waste, updated_at = NOW()
       WHERE id = v_item_id AND lab_id = v_lab_id;
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
