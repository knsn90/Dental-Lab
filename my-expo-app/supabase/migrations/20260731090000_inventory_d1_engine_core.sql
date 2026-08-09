-- ============================================================================
-- Envanter D1 — Tek tüketim motoru + idempotency + lot/SKT alanları
--
-- Amaç (additive, davranış bozmayan):
--   1. stock_movements'a idempotency_key + lot_no + expiry_date
--   2. Tüketim mantığını TEK çekirdeğe topla: apply_stage_materials_core()
--      - confirm_stage_materials  (operatör/sipariş detay yolu)  → çekirdek
--      - record_stage_consumption (istasyon kanban yolu)         → çekirdek
--      Böylece maliyet/kur snapshot'ı, stage_id ve pack_size bölmesi
--      HER İKİ yolda da aynı şekilde çalışır.
--   3. Aynı onay iki kez gönderilirse (retry / çift dokunuş / fallback zinciri)
--      stok İKİ KEZ düşmez — idempotency_key ile.
--
-- Uyumluluk:
--   - Eski istemciler confirm_stage_materials'ı 3 argümanla çağırmaya devam
--     edebilir (p_idempotency_key DEFAULT NULL).
--   - record_stage_consumption imzası değişmedi; miktar semantiği birebir
--     korundu (qty_in_stock_unit = true → birim çevrimi ve pack bölmesi yok).
-- ============================================================================

-- ── 1) Kolonlar ─────────────────────────────────────────────────────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS lot_no          text,
  ADD COLUMN IF NOT EXISTS expiry_date     date;

COMMENT ON COLUMN public.stock_movements.idempotency_key IS
  'İstemci başına benzersiz onay anahtarı. Aynı anahtarla ikinci yazım sessizce yok sayılır (çift düşüm koruması).';
COMMENT ON COLUMN public.stock_movements.lot_no IS
  'Alış/tüketim lot veya seri numarası (izlenebilirlik). Opsiyonel.';
COMMENT ON COLUMN public.stock_movements.expiry_date IS
  'Lot son kullanma tarihi. Opsiyonel.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_idem
  ON public.stock_movements (lab_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_stock_movements_lot
  ON public.stock_movements (item_id, lot_no)
  WHERE lot_no IS NOT NULL;

-- ── 2) Çekirdek motor (yetki kontrolü YOK — çağıran fonksiyon sorumludur) ──
CREATE OR REPLACE FUNCTION public.apply_stage_materials_core(
  p_stage_id          uuid,
  p_lines             jsonb,
  p_actor             uuid    DEFAULT NULL,
  p_idempotency_key   text    DEFAULT NULL,
  p_work_order_id     uuid    DEFAULT NULL,
  p_stage_name        text    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_work_order UUID; v_lab_id UUID; v_stage_name TEXT;
  v_line JSONB; v_idx INT := 0; v_written INT := 0; v_rows INT := 0;
  v_item_id UUID; v_qty NUMERIC; v_waste NUMERIC; v_raw_qty NUMERIC; v_raw_waste NUMERIC;
  v_item_unit TEXT; v_pack NUMERIC; v_item_cost NUMERIC; v_ccy TEXT;
  v_deduct NUMERIC; v_deduct_waste NUMERIC; v_rate NUMERIC; v_base TEXT; v_note TEXT;
  v_in_stock_unit BOOLEAN; v_key TEXT; v_lot TEXT; v_exp DATE;
BEGIN
  IF p_stage_id IS NOT NULL THEN
    SELECT os.work_order_id, ls.name INTO v_work_order, v_stage_name
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.id = p_stage_id;
  END IF;

  -- Aşama kaydı yoksa (legacy çağrı) iş emri + aşama adı ile devam et
  v_work_order := COALESCE(v_work_order, p_work_order_id);
  v_stage_name := COALESCE(v_stage_name, p_stage_name);
  IF v_work_order IS NULL THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = v_work_order;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    v_idx := v_idx + 1;

    v_item_id := NULLIF(v_line->>'item_id','')::UUID;
    -- actual_qty (yeni istemci) veya quantity (legacy istemci)
    v_qty   := COALESCE((v_line->>'actual_qty')::NUMERIC, (v_line->>'quantity')::NUMERIC, 0);
    v_waste := COALESCE((v_line->>'waste_qty')::NUMERIC, 0);
    IF v_item_id IS NULL THEN CONTINUE; END IF;
    IF (v_qty + v_waste) <= 0 THEN CONTINUE; END IF;

    -- Miktar zaten stok biriminde mi? (legacy kanban yolu → true)
    v_in_stock_unit := COALESCE((v_line->>'qty_in_stock_unit')::BOOLEAN, false);

    SELECT unit, pack_size, COALESCE(unit_cost,0),
           COALESCE(NULLIF(last_unit_cost_currency,''), NULLIF(default_purchase_currency,''),'TRY')
      INTO v_item_unit, v_pack, v_item_cost, v_ccy
      FROM public.stock_items WHERE id = v_item_id AND lab_id = v_lab_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_raw_qty := v_qty; v_raw_waste := v_waste;

    IF v_in_stock_unit THEN
      -- Legacy semantiği: girilen değer stok biriminde, dokunma
      v_deduct := v_qty; v_deduct_waste := v_waste;
    ELSE
      IF v_pack IS NULL OR v_pack <= 0 THEN
        v_qty   := public.convert_qty(v_qty,   v_line->>'unit', v_item_unit);
        v_waste := public.convert_qty(v_waste, v_line->>'unit', v_item_unit);
        v_deduct := v_qty; v_deduct_waste := v_waste;
      ELSE
        -- Paket içeriği tüketimi: içerik birimi → kesirli paket adedi
        v_deduct := v_qty / v_pack; v_deduct_waste := v_waste / v_pack;
      END IF;
    END IF;

    SELECT gsr.rate, gsr.base_currency INTO v_rate, v_base
      FROM public.get_snapshot_rate(v_lab_id, v_ccy) gsr;
    v_rate := COALESCE(v_rate,1); v_base := COALESCE(v_base,'TRY');

    v_lot := NULLIF(v_line->>'lot_no','');
    v_exp := NULLIF(v_line->>'expiry_date','')::DATE;

    IF v_deduct > 0 THEN
      v_note := COALESCE(v_line->>'note', v_stage_name);
      IF NOT v_in_stock_unit AND v_pack IS NOT NULL AND v_pack > 0 THEN
        v_note := v_raw_qty || ' ' || COALESCE(v_line->>'unit','') || ' · ' || v_note;
      END IF;
      v_key := CASE WHEN p_idempotency_key IS NULL THEN NULL
                    ELSE p_idempotency_key || ':' || v_idx || ':out' END;

      INSERT INTO public.stock_movements (
        lab_id,item_id,item_name,type,quantity,unit,unit_cost_at_time,currency,rate_at_time,
        unit_cost_base_at_time,base_currency_at_time,total_cost_at_time,total_cost_base_at_time,
        note,source,user_id,order_id,stage,stage_id,idempotency_key,lot_no,expiry_date
      ) VALUES (
        v_lab_id,v_item_id,
        COALESCE(NULLIF(v_line->>'item_name',''),(SELECT name FROM public.stock_items WHERE id=v_item_id)),
        'OUT',v_deduct,v_item_unit,v_item_cost,v_ccy,v_rate,
        v_item_cost*v_rate,v_base,v_deduct*v_item_cost,v_deduct*v_item_cost*v_rate,
        v_note,'stage-consumption',COALESCE(p_actor, auth.uid()),v_work_order,v_stage_name,p_stage_id,
        v_key,v_lot,v_exp
      )
      ON CONFLICT (lab_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT; v_written := v_written + v_rows;
    END IF;

    IF v_deduct_waste > 0 THEN
      v_note := COALESCE(v_line->>'waste_reason','fire');
      IF NOT v_in_stock_unit AND v_pack IS NOT NULL AND v_pack > 0 THEN
        v_note := v_raw_waste || ' ' || COALESCE(v_line->>'unit','') || ' · ' || v_note;
      END IF;
      v_key := CASE WHEN p_idempotency_key IS NULL THEN NULL
                    ELSE p_idempotency_key || ':' || v_idx || ':waste' END;

      INSERT INTO public.stock_movements (
        lab_id,item_id,item_name,type,quantity,unit,unit_cost_at_time,currency,rate_at_time,
        unit_cost_base_at_time,base_currency_at_time,total_cost_at_time,total_cost_base_at_time,
        note,source,user_id,order_id,stage,stage_id,waste_reason,idempotency_key,lot_no,expiry_date
      ) VALUES (
        v_lab_id,v_item_id,
        COALESCE(NULLIF(v_line->>'item_name',''),(SELECT name FROM public.stock_items WHERE id=v_item_id)),
        'WASTE',v_deduct_waste,v_item_unit,v_item_cost,v_ccy,v_rate,
        v_item_cost*v_rate,v_base,v_deduct_waste*v_item_cost,v_deduct_waste*v_item_cost*v_rate,
        v_note,'stage-consumption',COALESCE(p_actor, auth.uid()),v_work_order,v_stage_name,p_stage_id,
        v_line->>'waste_reason',v_key,v_lot,v_exp
      )
      ON CONFLICT (lab_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT; v_written := v_written + v_rows;
    END IF;
  END LOOP;

  RETURN v_written;
END; $function$;

COMMENT ON FUNCTION public.apply_stage_materials_core(uuid,jsonb,uuid,text,uuid,text) IS
  'Aşama malzeme tüketiminin TEK çekirdeği. Yetki kontrolü yapmaz — yalnız SECURITY DEFINER sarmalayıcılardan çağrılır.';

-- İstemciye açma: yalnız sarmalayıcılar çağırır
REVOKE ALL ON FUNCTION public.apply_stage_materials_core(uuid,jsonb,uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stage_materials_core(uuid,jsonb,uuid,text,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_stage_materials_core(uuid,jsonb,uuid,text,uuid,text) FROM authenticated;

-- ── 3) confirm_stage_materials → çekirdek + idempotency anahtarı ────────────
DROP FUNCTION IF EXISTS public.confirm_stage_materials(uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.confirm_stage_materials(
  p_stage_id        uuid,
  p_lines           jsonb,
  p_advance_stage   boolean DEFAULT true,
  p_idempotency_key text    DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_stage_status stage_status; v_user_type TEXT; v_role TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT status INTO v_stage_status FROM public.order_stages WHERE id = p_stage_id;
  IF v_stage_status IS NULL THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type='admin' OR (v_user_type='lab' AND v_role IN ('manager','admin'))
    OR EXISTS (SELECT 1 FROM public.order_stages WHERE id=p_stage_id AND technician_id=v_caller)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.apply_stage_materials_core(p_stage_id, p_lines, v_caller, p_idempotency_key);

  IF p_advance_stage AND v_stage_status='aktif' THEN
    PERFORM public.complete_stage_simple(p_stage_id);
  END IF;
  RETURN TRUE;
END; $function$;

GRANT EXECUTE ON FUNCTION public.confirm_stage_materials(uuid,jsonb,boolean,text) TO authenticated, service_role;

-- ── 4) record_stage_consumption → aynı çekirdek (miktar semantiği korunur) ──
CREATE OR REPLACE FUNCTION public.record_stage_consumption(
  p_work_order_id uuid,
  p_stage         text,
  p_items         jsonb,
  p_user_id       uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stage_id UUID;
  v_lines JSONB;
BEGIN
  -- Aşama adından order_stages kaydını çöz (önce aktif olan, sonra en güncel)
  SELECT os.id INTO v_stage_id
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.work_order_id = p_work_order_id
     AND lower(btrim(ls.name)) = lower(btrim(p_stage))
   ORDER BY (os.status = 'aktif') DESC, os.completed_at DESC NULLS FIRST, os.sequence_order DESC
   LIMIT 1;
  -- Bulunamazsa hata verme: iş emri + aşama adı ile hareket yine de yazılır
  -- (bugünkü davranış korunur, sadece stage_id boş kalır).

  -- Legacy istemci miktarı zaten stok biriminde gönderir → çevrim/pack bölmesi yok
  SELECT jsonb_agg(el || jsonb_build_object('qty_in_stock_unit', true))
    INTO v_lines
    FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) el;

  PERFORM public.apply_stage_materials_core(
    v_stage_id, COALESCE(v_lines,'[]'::jsonb), p_user_id, NULL, p_work_order_id, p_stage);
END; $function$;

COMMENT ON FUNCTION public.record_stage_consumption(uuid,text,jsonb,uuid) IS
  'İstasyon kanban yolu — apply_stage_materials_core sarmalayıcısı. Miktar stok biriminde beklenir.';
