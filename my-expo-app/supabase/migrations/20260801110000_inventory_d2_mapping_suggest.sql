-- ============================================================================
-- Envanter D2 / Adım 3 — Ürün → Üretim Malzemesi eşleştirme ÖNERİSİ
--
-- Spec §10: "ürün → Üretim Malzemesi eşleştirme önerisi ve onayı".
-- Bu fonksiyon YALNIZ ÖNERİR — hiçbir şey yazmaz. Onay UI'dan gelir.
--
-- Öncelik sırası kritik: bir ad birden çok anahtar kelime içerebilir.
--   "CZR. FC CLEAR GLAZE-5GR"        → CZR (porselen) + GLAZE  → GLAZE kazanır
--   "GC OPTIGLAZE COLOR ORANGE"      → glaze + color          → STAIN kazanır
--   "GC INİTİAL ZR-FS DENTİN DA1"    → ZR (zirkon) + dentin   → PORCELAIN kazanır
-- Bu yüzden STAIN → GLAZE → PORCELAIN → ZIRCON sırası uygulanır.
--
-- NOT: Postgres ARE'de kelime sınırı `\y` (`\b` değil).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.suggest_stock_material_mapping(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE (
  stock_item_id    uuid,
  stock_item_name  text,
  category         text,
  unit             text,
  current_code     text,
  suggested_code   text,
  suggested_id     uuid,
  confidence       text,
  matched_on       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH lab AS (
  SELECT COALESCE(p_lab_id, public.get_my_lab_id()) AS id
),
rules(prio, code, pattern, src) AS (VALUES
  -- ── ad bazlı (yüksek güven) — sıra önemli ────────────────────────────────
  ( 10, 'STAIN',         '(optiglaze[[:space:]]*color|external[[:space:]]*stain|\ystain\y|ex-3)', 'ad'),
  ( 20, 'GLAZE',         '(glaze|lust(re|er)[[:space:]]*paste)',                                  'ad'),
  ( 30, 'PORCELAIN',     '(dentin|dentın|enamel|lust(er|re)|mamelon|modifier|gingival|gingıval|body[[:space:]]*concept|\yczr\y|initial|inıtial)', 'ad'),
  ( 40, 'ZIRCON_BLOCK',  '(zirkon|zirconia|dd[[:space:]]*cube|katana|aidite|upcera[[:space:]]*st|\yyhl\y)', 'ad'),
  ( 50, 'GLASS_CERAMIC', '(cam[[:space:]]*seramik|e\.?max|glass[[:space:]]*ceramic|lisi)',        'ad'),
  ( 60, 'PMMA_DISC',     '(pmma)',                                                                'ad'),
  ( 70, 'SPLINT_RESIN',  '(nightguard|night[[:space:]]*guard|gece[[:space:]]*pla)',               'ad'),
  ( 80, 'TEMP_RESIN',    '(temporary|temp[[:space:]]*crown|geçici[[:space:]]*kron)',              'ad'),
  ( 90, 'MODEL_RESIN',   '(model[[:space:]]*re[çc]ine|model[[:space:]]*resin|rayshape)',          'ad'),
  (100, 'PLASTER',       '(al[çc]ı|al[çc]i|kenzstone|kimberlit|\ystone\y)',                       'ad'),
  (110, 'MILLING_BUR',   '(frez|elmas|\ybur\y)',                                                  'ad'),
  (120, 'WAX_DISC',      '(\ywax\y|mum[[:space:]]*disk)',                                         'ad'),
  (130, 'CASTING_ALLOY', '(d[öo]k[üu]m|ala[şs]ım)',                                               'ad'),
  (140, 'POLISH',        '(polisaj|polish)',                                                      'ad'),
  (150, 'SINTER_BEAD',   '(boncuk|sinter[[:space:]]*bead)',                                       'ad'),
  (160, 'WASH_SOLVENT',  '(\yipa\y|izopropil|solvent|\ywash\y)',                                  'ad')
),
cat_rules(prio, code, cat) AS (VALUES
  -- ── kategori bazlı yedek (orta güven) ────────────────────────────────────
  (200, 'ZIRCON_BLOCK',  'Zirkonyum'),
  (210, 'PORCELAIN',     'Seramik'),
  (220, 'MILLING_BUR',   'Freze'),
  (230, 'PLASTER',       'Alçı'),
  (240, 'GLASS_CERAMIC', 'Cam Seramik Bloklar')
),
hits AS (
  SELECT si.id, r.prio, r.code, r.src AS matched_on
    FROM public.stock_items si
    JOIN lab ON si.lab_id = lab.id
    JOIN rules r ON si.name ~* r.pattern
   WHERE si.is_active
  UNION ALL
  SELECT si.id, c.prio, c.code, 'kategori'
    FROM public.stock_items si
    JOIN lab ON si.lab_id = lab.id
    JOIN cat_rules c ON si.category = c.cat
   WHERE si.is_active
),
best AS (
  SELECT DISTINCT ON (id) id, prio, code, matched_on
    FROM hits ORDER BY id, prio
)
SELECT
  si.id,
  si.name,
  si.category,
  si.unit,
  cur.code,
  b.code,
  pm.id,
  CASE WHEN b.matched_on = 'ad' THEN 'yüksek'
       WHEN b.matched_on IS NOT NULL THEN 'orta'
       ELSE 'yok' END,
  COALESCE(b.matched_on, 'eşleşme yok')
FROM public.stock_items si
JOIN lab ON si.lab_id = lab.id
LEFT JOIN best b ON b.id = si.id
LEFT JOIN public.production_materials pm ON pm.lab_id = si.lab_id AND pm.code = b.code
LEFT JOIN public.production_materials cur ON cur.id = si.production_material_id
WHERE si.is_active
ORDER BY (b.code IS NULL) DESC, si.category NULLS LAST, si.name;
$function$;

COMMENT ON FUNCTION public.suggest_stock_material_mapping(uuid) IS
  'Urun -> uretim malzemesi eslestirme ONERISI. Hicbir sey yazmaz; onay UI tarafindan verilir.';

GRANT EXECUTE ON FUNCTION public.suggest_stock_material_mapping(uuid) TO authenticated, service_role;

-- Toplu onay: yalnız yönetici/admin, yalnız kendi labı
CREATE OR REPLACE FUNCTION public.apply_stock_material_mapping(p_pairs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id();
  v_pair jsonb; v_n int := 0;
BEGIN
  IF NOT (public.is_lab_manager() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND (user_type = 'admin' OR (user_type = 'lab' AND role IN ('manager','admin')))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(COALESCE(p_pairs,'[]'::jsonb)) LOOP
    UPDATE public.stock_items si
       SET production_material_id = NULLIF(v_pair->>'production_material_id','')::uuid,
           updated_at = now()
     WHERE si.id = (v_pair->>'stock_item_id')::uuid
       AND si.lab_id = v_lab
       AND (v_pair->>'production_material_id' IS NULL
            OR EXISTS (SELECT 1 FROM public.production_materials pm
                        WHERE pm.id = NULLIF(v_pair->>'production_material_id','')::uuid
                          AND pm.lab_id = v_lab));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END; $function$;

COMMENT ON FUNCTION public.apply_stock_material_mapping(jsonb) IS
  'Toplu eslestirme onayi. [{"stock_item_id":"...","production_material_id":"..."}]. Yalniz yonetici/admin.';

GRANT EXECUTE ON FUNCTION public.apply_stock_material_mapping(jsonb) TO authenticated, service_role;
