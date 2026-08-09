-- ============================================================================
-- Geçmiş tüketim denetimi (Envanter — Adım 1)
--
-- SALT OKUNUR. Hiçbir hareketi, stoğu, maliyeti DEĞİŞTİRMEZ. Amaç: geçmişte
-- girilmiş tüketim kayıtlarını D2 profiliyle karşılaştırıp sapmayı görünür
-- yapmak; düzeltme kararını insana bırakmak.
--
-- Üç fonksiyon:
--   unit_family(text)                  — birim ailesi (mass/volume/NULL)
--   consumption_norm(item, qty, unit)  — miktarı karşılaştırılabilir birime indirger
--   report_consumption_audit(bool)     — hareket başına kayıtlı vs beklenen
--   report_consumption_gaps()          — hiç kayıt girilmemiş tamamlanmış aşamalar
--
-- NEDEN AYRI BİR NORMALİZASYON: kayıtlı miktar kalem biriminde ("0.3 Adet"),
-- profil kuralı içerik biriminde ("0.3 gr") konuşuyor. Paketli kalemlerde
-- (pack_size + content_unit) ikisi aynı sayı olsa bile aynı şey DEĞİL —
-- 0.3 Adet × 5 gr = 1.5 gr. Karşılaştırma bu indirgeme yapılmadan yanıltır.
-- ============================================================================

-- ── 1) Birim ailesi — convert_qty'nin tablosuyla birebir ────────────────────
-- convert_qty çeviremediğinde miktarı AYNEN döndürüyor; bu yüzden "çevrildi mi,
-- yoksa çapraz aile mi" ayrımını dışarıdan bilmek gerekiyor.
CREATE OR REPLACE FUNCTION public.unit_family(p_unit text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT v.fam FROM (VALUES
    ('ml','volume'),('cc','volume'),('cl','volume'),('dl','volume'),
    ('l','volume'),('lt','volume'),
    ('mg','mass'),('g','mass'),('gr','mass'),('kg','mass')
  ) v(u, fam)
  WHERE v.u = rtrim(lower(btrim(coalesce(p_unit,''))), '.');
$fn$;

COMMENT ON FUNCTION public.unit_family(text) IS
  'Birimin ölçü ailesi: mass | volume | NULL (adet vb. sayılabilir).';

-- ── 2) Karşılaştırılabilir miktar ───────────────────────────────────────────
-- Dönen birim: paketli kalemde içerik birimi (gr/ml), değilse kalem birimi.
-- cross_family = TRUE ise miktar çevrilemedi, olduğu gibi taşındı → rapor bunu
-- "birim uyuşmazlığı" olarak işaretler (stock_effect de aynı şeyi yapıyor).
CREATE OR REPLACE FUNCTION public.consumption_norm(
  p_item_id uuid, p_qty numeric, p_unit text
) RETURNS TABLE (qty numeric, unit text, cross_family boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_unit text; v_pack numeric; v_content text;
  f_in text; f_item text; f_content text;
  v_q numeric; v_cross boolean := false;
BEGIN
  IF p_qty IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text, false;
    RETURN;
  END IF;

  SELECT si.unit, si.pack_size, si.content_unit
    INTO v_unit, v_pack, v_content
    FROM public.stock_items si WHERE si.id = p_item_id;

  f_in      := public.unit_family(p_unit);
  f_item    := public.unit_family(v_unit);
  f_content := public.unit_family(v_content);

  -- (a) Miktar zaten içerik biriminde verilmiş (kural "0.3 gr" der, kalem paketli)
  IF v_pack IS NOT NULL AND v_pack > 0 AND v_content IS NOT NULL
     AND ( lower(btrim(coalesce(p_unit,''))) = lower(btrim(v_content))
           OR (f_in IS NOT NULL AND f_in = f_content) ) THEN
    RETURN QUERY SELECT public.convert_qty(p_qty, p_unit, v_content), v_content, false;
    RETURN;
  END IF;

  -- (b) Kalem birimine indir
  IF p_unit IS NULL
     OR lower(btrim(p_unit)) = lower(btrim(coalesce(v_unit,''))) THEN
    v_q := p_qty;
  ELSIF f_in IS NOT NULL AND f_in = f_item THEN
    v_q := public.convert_qty(p_qty, p_unit, v_unit);
  ELSE
    v_q := p_qty; v_cross := true;   -- çevrilemez (ör. "adet" ↔ "gr")
  END IF;

  -- (c) Paketli kalemde içerik birimine aç
  IF v_pack IS NOT NULL AND v_pack > 0 AND v_content IS NOT NULL THEN
    RETURN QUERY SELECT v_q * v_pack, v_content, v_cross;
  ELSE
    RETURN QUERY SELECT v_q, v_unit, v_cross;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.consumption_norm(uuid,numeric,text) TO authenticated, service_role;

-- ── 3) Denetim raporu — hareket başına kayıtlı vs profilin beklediği ────────
CREATE OR REPLACE FUNCTION public.report_consumption_audit(
  p_include_reversed boolean DEFAULT false
) RETURNS TABLE (
  movement_id     uuid,
  moved_at        timestamptz,
  reversed        boolean,
  order_id        uuid,
  order_number    text,
  work_type       text,
  tooth_count     int,
  stage_id        uuid,
  stage_name      text,
  item_id         uuid,
  item_name       text,
  item_unit       text,
  recorded_qty    numeric,
  recorded_unit   text,
  expected_qty    numeric,
  expected_unit   text,
  basis           text,
  reason          text,
  norm_unit       text,
  recorded_norm   numeric,
  expected_norm   numeric,
  ratio           numeric,
  flags           text[],
  severity        int,
  cost            numeric,
  currency        text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
WITH base AS (
  SELECT
    m.id, m.created_at, COALESCE(m.is_reversed,false) AS rev, m.order_id,
    m.stage_id, m.item_id, m.quantity, m.unit, m.total_cost_at_time, m.currency,
    m.stage AS stage_txt,
    wo.order_number, wo.work_type,
    COALESCE(array_length(wo.tooth_numbers,1),0) AS teeth,
    os.station_id, st.name AS station_name,
    si.name AS item_name, si.unit AS item_unit, si.production_material_id
  FROM public.stock_movements m
  JOIN public.stock_items si ON si.id = m.item_id
  LEFT JOIN public.work_orders wo ON wo.id = m.order_id
  LEFT JOIN public.order_stages os ON os.id = m.stage_id
  LEFT JOIN public.lab_stations st ON st.id = os.station_id
  WHERE m.lab_id = public.get_my_lab_id()
    AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
    AND m.order_id IS NOT NULL
    AND (p_include_reversed OR NOT COALESCE(m.is_reversed,false))
), res AS (
  SELECT b.*,
         r.rule_id, r.qty AS exp_qty, r.unit AS exp_unit, r.basis AS exp_basis,
         r.reason AS exp_reason,
         COALESCE(cr.is_assumption,false) AS rule_assumption,
         pm.allowed_stations
  FROM base b
  LEFT JOIN LATERAL public.resolve_consumption_qty(b.stage_id, b.item_id) r ON b.stage_id IS NOT NULL
  LEFT JOIN public.consumption_rules cr ON cr.id = r.rule_id
  LEFT JOIN public.production_materials pm ON pm.id = b.production_material_id
), norm AS (
  SELECT res.*,
         rn.qty AS rec_norm, rn.unit AS rec_unit_n, COALESCE(rn.cross_family,false) AS rec_cross,
         en.qty AS exp_norm, en.unit AS exp_unit_n, COALESCE(en.cross_family,false) AS exp_cross
  FROM res
  LEFT JOIN LATERAL public.consumption_norm(res.item_id, res.quantity, res.unit) rn ON true
  LEFT JOIN LATERAL public.consumption_norm(res.item_id, res.exp_qty, res.exp_unit) en ON res.exp_qty IS NOT NULL
), calc AS (
  SELECT norm.*,
         CASE
           WHEN norm.exp_norm IS NULL OR norm.exp_norm = 0 THEN NULL
           WHEN norm.rec_cross OR norm.exp_cross THEN NULL
           WHEN norm.rec_unit_n IS DISTINCT FROM norm.exp_unit_n THEN NULL
           ELSE round(norm.rec_norm / norm.exp_norm, 3)
         END AS ratio_c
  FROM norm
), flagged AS (
  SELECT calc.*,
    array_remove(ARRAY[
      calc.exp_reason,                                            -- kural_yok / urun_baglanmamis / lab_profili_yok
      CASE WHEN calc.stage_id IS NULL THEN 'asama_yok' END,
      CASE WHEN calc.rec_cross OR calc.exp_cross
             OR (calc.exp_qty IS NOT NULL AND calc.rec_unit_n IS DISTINCT FROM calc.exp_unit_n)
           THEN 'birim_uyusmazligi' END,
      CASE WHEN calc.ratio_c >= 1.25 THEN 'fazla'
           WHEN calc.ratio_c <= 0.80 THEN 'eksik' END,
      CASE WHEN calc.rule_assumption THEN 'varsayim_kural' END,
      CASE WHEN calc.allowed_stations IS NOT NULL
             AND array_length(calc.allowed_stations,1) > 0
             AND calc.station_id IS NOT NULL
             AND NOT (calc.station_id = ANY(calc.allowed_stations))
           THEN 'istasyon_disi' END,
      CASE WHEN calc.rev THEN 'ters_cevrildi' END
    ], NULL) AS flags_c
  FROM calc
)
SELECT
  f.id, f.created_at, f.rev, f.order_id, f.order_number, f.work_type, f.teeth,
  f.stage_id, COALESCE(f.station_name, f.stage_txt), f.item_id, f.item_name, f.item_unit,
  f.quantity, f.unit,
  f.exp_qty, f.exp_unit, f.exp_basis, f.exp_reason,
  f.rec_unit_n, f.rec_norm, f.exp_norm, f.ratio_c, f.flags_c,
  CASE
    WHEN 'birim_uyusmazligi' = ANY(f.flags_c)
      OR f.ratio_c >= 3 OR f.ratio_c <= 0.34 THEN 3
    WHEN f.exp_qty IS NULL OR f.ratio_c >= 1.25 OR f.ratio_c <= 0.80 THEN 2
    WHEN COALESCE(array_length(f.flags_c,1),0) > 0 THEN 1
    ELSE 0
  END,
  f.total_cost_at_time, f.currency
FROM flagged f
ORDER BY
  CASE
    WHEN 'birim_uyusmazligi' = ANY(f.flags_c)
      OR f.ratio_c >= 3 OR f.ratio_c <= 0.34 THEN 3
    WHEN f.exp_qty IS NULL OR f.ratio_c >= 1.25 OR f.ratio_c <= 0.80 THEN 2
    WHEN COALESCE(array_length(f.flags_c,1),0) > 0 THEN 1
    ELSE 0
  END DESC,
  f.created_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.report_consumption_audit(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.report_consumption_audit(boolean) IS
  'Geçmiş tüketim hareketlerini D2 profiliyle karşılaştırır. Salt okunur.';

-- ── 4) Boşluk raporu — tüketen istasyonda tamamlanıp kaydı olmayan aşamalar ─
-- Asıl risk sapma değil, kaydın hiç olmaması: sapmayı görebilmek için önce
-- bir kayıt gerekiyor.
CREATE OR REPLACE FUNCTION public.report_consumption_gaps()
RETURNS TABLE (
  station_id      uuid,
  station_name    text,
  done_stages     int,
  with_material   int,
  missing         int,
  last_missing_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    st.id, st.name,
    count(*)::int,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.stock_movements m
       WHERE m.stage_id = os.id
         AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
         AND NOT COALESCE(m.is_reversed,false)))::int,
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.stock_movements m
       WHERE m.stage_id = os.id
         AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
         AND NOT COALESCE(m.is_reversed,false)))::int,
    max(os.completed_at) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.stock_movements m
       WHERE m.stage_id = os.id
         AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
         AND NOT COALESCE(m.is_reversed,false)))
  FROM public.order_stages os
  JOIN public.work_orders wo ON wo.id = os.work_order_id
  JOIN public.lab_stations st ON st.id = os.station_id
  WHERE wo.lab_id = public.get_my_lab_id()
    AND os.status = 'tamamlandi'
    AND COALESCE(st.consumes_materials,false)
  GROUP BY st.id, st.name
  ORDER BY count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.stock_movements m
       WHERE m.stage_id = os.id
         AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
         AND NOT COALESCE(m.is_reversed,false))) DESC,
    st.name;
$fn$;

GRANT EXECUTE ON FUNCTION public.report_consumption_gaps() TO authenticated, service_role;

COMMENT ON FUNCTION public.report_consumption_gaps() IS
  'Tüketen istasyonlarda tamamlanmış ama malzeme kaydı olmayan aşama sayısı. Salt okunur.';
