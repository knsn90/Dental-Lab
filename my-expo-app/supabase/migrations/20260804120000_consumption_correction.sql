-- ============================================================================
-- Geçmiş tüketim düzeltmesi (Envanter — Adım 2)
--
-- YÖNTEM (kullanıcı kararı): "ters çevir + düzeltilmiş yeni kayıt".
-- Mevcut satırın miktarını UPDATE etmek yerine orijinal hareket ters çevrilir
-- ve düzeltilmiş miktarla YENİ hareket yazılır. Sebep: trg_fifo_apply yalnız
-- INSERT'te çalışıyor — UPDATE edilen bir satırın FIFO tahsisi eski miktarda
-- kalır ve maliyet katmanları sessizce bozulur. Yeni kayıt FIFO'yu yeniden
-- çalıştırır, eski değer de kaybolmaz.
--
-- TERS ÇEVİRMENİN EKSİĞİ TAMAMLANIYOR: bugüne kadar is_reversed işaretlemek
-- stoğu geri veriyordu (trg_stock_qty_sync) ama FIFO tahsislerini geri
-- almıyordu. fifo_release_movement() bunu kapatır.
--
-- Stok miktarına, sipariş maliyetine ELLE dokunulmaz — ikisi de trigger'ların
-- işi (trg_stock_qty_sync, trg_stock_movements_recompute).
-- ============================================================================

-- ── 1) FIFO tahsislerini katmanlara iade et ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fifo_release_movement(p_movement_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE a record; v_n int := 0;
BEGIN
  FOR a IN SELECT * FROM public.fifo_allocations WHERE movement_id = p_movement_id LOOP
    IF a.layer_id IS NOT NULL THEN
      UPDATE public.fifo_layers
         SET qty_remaining = qty_remaining + a.qty
       WHERE id = a.layer_id;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  DELETE FROM public.fifo_allocations WHERE movement_id = p_movement_id;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fifo_release_movement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fifo_release_movement(uuid) TO service_role;

-- ── 2) Kural birimindeki miktarı kalem birimine indir ──────────────────────
-- consumption_norm'un tersi: o karşılaştırma için içerik birimine AÇAR,
-- bu ise stoğa yazmak için kalem birimine KAPATIR (0.3 gr → 5 gr'lık kavanozda
-- 0.06 Adet). Çevrilemiyorsa NULL döner — çağıran sessizce yanlış yazmasın.
CREATE OR REPLACE FUNCTION public.consumption_to_stock_qty(
  p_item_id uuid, p_qty numeric, p_unit text
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_unit text; v_pack numeric; v_content text;
  f_in text; f_item text; f_content text;
BEGIN
  IF p_qty IS NULL THEN RETURN NULL; END IF;

  SELECT si.unit, si.pack_size, si.content_unit
    INTO v_unit, v_pack, v_content
    FROM public.stock_items si WHERE si.id = p_item_id;

  f_in      := public.unit_family(p_unit);
  f_item    := public.unit_family(v_unit);
  f_content := public.unit_family(v_content);

  -- 6 ondalık: paket bölmesi periyodik ondalık üretebiliyor
  -- (0.06 ml ÷ 2.6 = 0.023076923076923078) ve bu sayı stoğa yazılıp
  -- her ekranda ham haliyle görünüyordu.
  IF p_unit IS NULL OR lower(btrim(p_unit)) = lower(btrim(coalesce(v_unit,''))) THEN
    RETURN round(p_qty, 6);
  END IF;
  IF f_in IS NOT NULL AND f_in = f_item THEN
    RETURN round(public.convert_qty(p_qty, p_unit, v_unit), 6);
  END IF;
  IF v_pack IS NOT NULL AND v_pack > 0 AND v_content IS NOT NULL
     AND ( lower(btrim(p_unit)) = lower(btrim(v_content))
           OR (f_in IS NOT NULL AND f_in = f_content) ) THEN
    RETURN round(public.convert_qty(p_qty, p_unit, v_content) / v_pack, 6);
  END IF;

  RETURN NULL;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.consumption_to_stock_qty(uuid,numeric,text) TO authenticated, service_role;

-- ── 3) Düzeltme RPC'si ─────────────────────────────────────────────────────
-- p_new_qty NULL + p_cancel false  → profilin hesapladığı miktar uygulanır
-- p_new_qty dolu                   → elle verilen miktar (birim: p_new_unit)
-- p_cancel true                    → yalnız iptal; yerine yeni kayıt yazılmaz
-- p_new_item_id / p_new_stage_id   → yanlış kalem / yanlış aşama düzeltmesi
CREATE OR REPLACE FUNCTION public.correct_stage_consumption(
  p_movement_id  uuid,
  p_new_qty      numeric DEFAULT NULL,
  p_new_unit     text    DEFAULT NULL,
  p_new_item_id  uuid    DEFAULT NULL,
  p_new_stage_id uuid    DEFAULT NULL,
  p_cancel       boolean DEFAULT false,
  p_note         text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_lab uuid := public.get_my_lab_id();
  m public.stock_movements%ROWTYPE;
  v_item uuid; v_stage uuid; v_stage_name text; v_order uuid;
  v_qty numeric; v_unit text; v_basis text; v_reason text;
  v_stock_qty numeric;
  v_item_unit text; v_item_name text; v_cost numeric; v_ccy text;
  v_rate numeric; v_base text;
  v_new_id uuid; v_released int; v_note text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO m FROM public.stock_movements
   WHERE id = p_movement_id AND lab_id = v_lab;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Hareket bulunamadi'; END IF;
  IF upper(COALESCE(m.type,'')) NOT IN ('OUT','WASTE') THEN
    RAISE EXCEPTION 'Yalniz tuketim hareketi duzeltilebilir (OUT/WASTE)';
  END IF;
  IF COALESCE(m.is_reversed,false) THEN
    RAISE EXCEPTION 'Bu hareket zaten ters cevrilmis';
  END IF;

  v_item  := COALESCE(p_new_item_id,  m.item_id);
  v_stage := COALESCE(p_new_stage_id, m.stage_id);
  v_order := m.order_id;

  -- Aşama değiştiriliyorsa aynı siparişe ait olmalı — başka işin aşamasına
  -- malzeme taşımak sessiz bir veri karışması olur.
  IF p_new_stage_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_stages os
                    WHERE os.id = p_new_stage_id AND os.work_order_id = v_order) THEN
      RAISE EXCEPTION 'Secilen asama bu siparise ait degil';
    END IF;
  END IF;

  SELECT si.unit, si.name, COALESCE(si.unit_cost,0),
         COALESCE(NULLIF(si.last_unit_cost_currency,''), NULLIF(si.default_purchase_currency,''),'TRY')
    INTO v_item_unit, v_item_name, v_cost, v_ccy
    FROM public.stock_items si WHERE si.id = v_item AND si.lab_id = v_lab;
  IF v_item_unit IS NULL THEN RAISE EXCEPTION 'Kalem bulunamadi'; END IF;

  SELECT ls.name INTO v_stage_name
    FROM public.order_stages os JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.id = v_stage;
  v_stage_name := COALESCE(v_stage_name, m.stage);

  -- ── Yeni miktar ────────────────────────────────────────────────────────
  IF NOT p_cancel THEN
    IF p_new_qty IS NULL THEN
      SELECT r.qty, r.unit, r.basis, r.reason
        INTO v_qty, v_unit, v_basis, v_reason
        FROM public.resolve_consumption_qty(v_stage, v_item) r;
      IF v_qty IS NULL THEN
        RAISE EXCEPTION 'Profil miktar hesaplayamadi (%). Miktari elle girin.',
          COALESCE(v_reason,'kural_yok');
      END IF;
    ELSE
      IF p_new_qty <= 0 THEN RAISE EXCEPTION 'Miktar sifirdan buyuk olmali'; END IF;
      v_qty   := p_new_qty;
      v_unit  := COALESCE(p_new_unit, v_item_unit);
      v_basis := 'elle girildi';
    END IF;

    v_stock_qty := public.consumption_to_stock_qty(v_item, v_qty, v_unit);
    IF v_stock_qty IS NULL OR v_stock_qty <= 0 THEN
      RAISE EXCEPTION 'Miktar kalem birimine (%) cevrilemedi: % %',
        v_item_unit, v_qty, COALESCE(v_unit,'');
    END IF;
  END IF;

  -- ── Orijinali ters çevir (stok + FIFO + maliyet geri döner) ────────────
  v_released := public.fifo_release_movement(m.id);

  UPDATE public.stock_movements
     SET is_reversed = true,
         note = COALESCE(note,'') || ' [DUZELTILDI]'
   WHERE id = m.id;

  -- İz kaydı order_events'e YAZILMAZ: event_type bir enum ve stok düzeltmesi
  -- için değeri yok. Merkezi log_activity() zaten stok hareketlerini izliyor.
  IF p_cancel THEN
    PERFORM public.log_activity(
      'stock_consumption_cancelled', 'stock_movement', m.id, m.item_name,
      jsonb_build_object('old_qty', m.quantity, 'old_unit', m.unit,
                         'order_id', v_order, 'note', p_note),
      v_lab, auth.uid());
    RETURN jsonb_build_object('ok', true, 'action', 'cancel',
      'movement_id', m.id, 'released_allocations', v_released);
  END IF;

  -- ── Düzeltilmiş kaydı yaz ──────────────────────────────────────────────
  SELECT gsr.rate, gsr.base_currency INTO v_rate, v_base
    FROM public.get_snapshot_rate(v_lab, v_ccy) gsr;
  v_rate := COALESCE(v_rate,1); v_base := COALESCE(v_base,'TRY');

  v_note := 'duzeltme: ' || COALESCE(v_basis,'') ||
            CASE WHEN p_note IS NULL OR btrim(p_note)='' THEN '' ELSE ' — ' || p_note END;

  INSERT INTO public.stock_movements (
    lab_id, item_id, item_name, type, quantity, unit,
    unit_cost_at_time, currency, rate_at_time,
    unit_cost_base_at_time, base_currency_at_time,
    total_cost_at_time, total_cost_base_at_time,
    note, source, user_id, order_id, stage, stage_id,
    reference_movement_id, idempotency_key, waste_reason
  ) VALUES (
    v_lab, v_item, v_item_name, upper(m.type), v_stock_qty, v_item_unit,
    v_cost, v_ccy, v_rate,
    v_cost * v_rate, v_base,
    v_stock_qty * v_cost, v_stock_qty * v_cost * v_rate,
    v_note, 'stage-consumption', auth.uid(), v_order, v_stage_name, v_stage,
    m.id, 'correct:' || m.id::text, m.waste_reason
  )
  ON CONFLICT (lab_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'Bu hareket icin duzeltme zaten yazilmis';
  END IF;

  PERFORM public.log_activity(
    'stock_consumption_corrected', 'stock_movement', v_new_id, v_item_name,
    jsonb_build_object(
      'reversed_movement_id', m.id, 'order_id', v_order,
      'old_qty', m.quantity, 'old_unit', m.unit,
      'new_qty', v_stock_qty, 'new_unit', v_item_unit,
      'basis', v_basis, 'item_changed', (p_new_item_id IS NOT NULL),
      'stage_changed', (p_new_stage_id IS NOT NULL), 'note', p_note),
    v_lab, auth.uid());

  RETURN jsonb_build_object(
    'ok', true, 'action', 'correct',
    'movement_id', m.id, 'new_movement_id', v_new_id,
    'old_qty', m.quantity, 'old_unit', m.unit,
    'new_qty', v_stock_qty, 'new_unit', v_item_unit,
    'basis', v_basis, 'released_allocations', v_released);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.correct_stage_consumption(uuid,numeric,text,uuid,uuid,boolean,text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.correct_stage_consumption(uuid,numeric,text,uuid,uuid,boolean,text) IS
  'Gecmis tuketim hareketini ters cevirip duzeltilmis kaydi yazar (Adim 2).';
