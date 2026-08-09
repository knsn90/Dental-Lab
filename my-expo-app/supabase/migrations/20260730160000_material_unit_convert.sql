-- Malzeme tüketiminde birim uyuşmazlığı düzeltmesi.
--
-- Sorun: istasyon tüketim kuralı "ml" cinsinden (ör. 2 ml/diş) ama stok kalemi
-- "L" cinsinden stoklanmış. Modal kalem seçilince birimi L yapıyor ama miktarı
-- çevirmiyordu → 4 ml tahmin, sessizce 4 L (1000× fazla) olarak düşülüyordu.
-- confirm_stage_materials da hiç dönüşüm yapmadan actual_qty'yi kalemin biriminde
-- düşüyordu.
--
-- Çözüm: (1) convert_qty(qty, from, to) — yalnız aynı aile (hacim/kütle) içinde
-- çevirir, çevrilemezse qty'yi AYNEN döndürür (güvenli no-op). (2) RPC'de paketsiz
-- kalemlerde satır birimi ↔ kalem birimi dönüşümü (modal artık çeviriyor; bu
-- eski/başka çağıranlar için savunma). İstemci: core/materials/unitConvert.ts +
-- MaterialConfirmModal.applyPick.

CREATE OR REPLACE FUNCTION public.convert_qty(p_qty numeric, p_from text, p_to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  f text := lower(btrim(coalesce(p_from,'')));
  t text := lower(btrim(coalesce(p_to,'')));
  fam_f text; fac_f numeric; fam_t text; fac_t numeric;
BEGIN
  IF p_qty IS NULL THEN RETURN p_qty; END IF;
  f := rtrim(f, '.'); t := rtrim(t, '.');
  IF f = t THEN RETURN p_qty; END IF;

  SELECT fam, fac INTO fam_f, fac_f FROM (VALUES
    ('ml','volume',1),('cc','volume',1),('cl','volume',10),('dl','volume',100),('l','volume',1000),('lt','volume',1000),
    ('mg','mass',1),('g','mass',1000),('gr','mass',1000),('kg','mass',1000000)
  ) v(u,fam,fac) WHERE v.u = f;

  SELECT fam, fac INTO fam_t, fac_t FROM (VALUES
    ('ml','volume',1),('cc','volume',1),('cl','volume',10),('dl','volume',100),('l','volume',1000),('lt','volume',1000),
    ('mg','mass',1),('g','mass',1000),('gr','mass',1000),('kg','mass',1000000)
  ) v(u,fam,fac) WHERE v.u = t;

  IF fam_f IS NULL OR fam_t IS NULL OR fam_f <> fam_t THEN
    RETURN p_qty;               -- bilinmeyen/çapraz aile → dokunma
  END IF;
  RETURN round((p_qty * fac_f) / fac_t, 6);
END;
$fn$;

-- confirm_stage_materials: paketsiz kalemlerde birim dönüşümü guard'ı eklendi.
-- (Tam gövde — CREATE OR REPLACE; yeni satırlar "Birim uyuşmazlığı düzeltmesi" bloğu.)
CREATE OR REPLACE FUNCTION public.confirm_stage_materials(p_stage_id uuid, p_lines jsonb, p_advance_stage boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_item_unit    TEXT;
  v_pack         NUMERIC;
  v_item_cost    NUMERIC;
  v_ccy          TEXT;
  v_deduct       NUMERIC;
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

  IF NOT (
    v_user_type = 'admin'
    OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))
    OR EXISTS (SELECT 1 FROM public.order_stages WHERE id = p_stage_id AND technician_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_item_id := NULLIF(v_line->>'item_id', '')::UUID;
    v_qty     := COALESCE((v_line->>'actual_qty')::NUMERIC, 0);
    v_waste   := COALESCE((v_line->>'waste_qty')::NUMERIC,  0);

    IF v_item_id IS NULL THEN CONTINUE; END IF;
    IF (v_qty + v_waste) <= 0 THEN CONTINUE; END IF;

    SELECT unit, pack_size, COALESCE(unit_cost, 0),
           COALESCE(NULLIF(last_unit_cost_currency, ''),
                    NULLIF(default_purchase_currency, ''), 'TRY')
      INTO v_item_unit, v_pack, v_item_cost, v_ccy
      FROM public.stock_items
     WHERE id = v_item_id AND lab_id = v_lab_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Birim uyuşmazlığı düzeltmesi (yalnız PAKETSİZ kalem): satır birimi (ör. 'ml')
    -- ile kalemin stok birimi (ör. 'L') farklıysa miktarı kalem birimine çevir.
    IF v_pack IS NULL OR v_pack <= 0 THEN
      v_qty   := public.convert_qty(v_qty,   v_line->>'unit', v_item_unit);
      v_waste := public.convert_qty(v_waste, v_line->>'unit', v_item_unit);
    END IF;

    IF v_pack IS NOT NULL AND v_pack > 0 THEN
      v_deduct       := v_qty   / v_pack;
      v_deduct_waste := v_waste / v_pack;
    ELSE
      v_deduct       := v_qty;
      v_deduct_waste := v_waste;
    END IF;

    SELECT gsr.rate, gsr.base_currency INTO v_rate, v_base
      FROM public.get_snapshot_rate(v_lab_id, v_ccy) gsr;
    v_rate := COALESCE(v_rate, 1);
    v_base := COALESCE(v_base, 'TRY');

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

  IF p_advance_stage AND v_stage_status = 'aktif' THEN
    PERFORM public.complete_stage_simple(p_stage_id);
  END IF;

  RETURN TRUE;
END;
$function$;
