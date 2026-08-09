-- ============================================================================
-- Envanter D2 / Adım 4 — Global tüketim profili şablonu + disk verim tablosu
--
-- Kaynak: core/materials/consumptionRef.ts (laboratuvarın kendi üretim verisi)
--
-- İKİ TÜR DEĞER VAR ve karıştırılmamalı (spec §17: "varsayımlar ile doğrulanmış
-- davranışlar ayrı gösterilmelidir"):
--   • is_assumption = false → laboratuvardan gelen GERÇEK üretim verisi
--   • is_assumption = true  → düzenlenmesi beklenen başlangıç VARSAYIMI
--
-- Yeni hesap modeli `disc_yield`: zirkon/PMMA diskte verim diskin KALINLIĞINA
-- bağlıdır (12 mm → ~21 kron, 25 mm → ~52 kron). Tek bir "diş başına disk"
-- sabiti yanlış olurdu. Motor, teknisyenin seçtiği gerçek stok kaleminin
-- thickness_mm değerini disc_yield_ref'ten çözer.
-- ============================================================================

-- ── 1) Kural tablosuna varsayım işareti + not ──────────────────────────────
ALTER TABLE public.consumption_rules
  ADD COLUMN IF NOT EXISTS is_assumption boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS note          text;

COMMENT ON COLUMN public.consumption_rules.is_assumption IS
  'true = duzenlenmesi beklenen baslangic varsayimi. false = laboratuvardan gelen gercek uretim verisi.';

-- ── 2) disc_yield hesap modelini ekle ──────────────────────────────────────
ALTER TABLE public.consumption_rules DROP CONSTRAINT IF EXISTS consumption_rules_calc_model_check;
ALTER TABLE public.consumption_rules ADD CONSTRAINT consumption_rules_calc_model_check
  CHECK (calc_model IN ('fixed','per_tooth','per_jaw','per_unit','disc_yield'));

-- ── 3) Disk verim referansı (global, tenant'sız) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.disc_yield_ref (
  material_code text    NOT NULL,
  thickness_mm  int     NOT NULL,
  crowns_avg    numeric NOT NULL CHECK (crowns_avg > 0),
  label         text,
  PRIMARY KEY (material_code, thickness_mm)
);

COMMENT ON TABLE public.disc_yield_ref IS
  'Disk kalinligina gore ortalama kron verimi. consumptionRef.ts DISC_YIELD ile ayni kaynak.';

ALTER TABLE public.disc_yield_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lab users read disc yield" ON public.disc_yield_ref;
CREATE POLICY "Lab users read disc yield" ON public.disc_yield_ref
  FOR SELECT USING (is_lab_user());

INSERT INTO public.disc_yield_ref (material_code, thickness_mm, crowns_avg, label) VALUES
  ('ZIRCON_BLOCK', 12, 21.5, '12 mm'),
  ('ZIRCON_BLOCK', 14, 26,   '14 mm'),
  ('ZIRCON_BLOCK', 16, 33,   '16 mm'),
  ('ZIRCON_BLOCK', 18, 40,   '18 mm'),
  ('ZIRCON_BLOCK', 25, 52.5, '20-25 mm'),
  ('PMMA_DISC',    12, 25,   '12 mm'),
  ('PMMA_DISC',    16, 35,   '16 mm'),
  ('PMMA_DISC',    20, 45,   '20 mm'),
  ('PMMA_DISC',    25, 60,   '25 mm')
ON CONFLICT (material_code, thickness_mm) DO NOTHING;

-- ── 4) Global şablon profili + ilk sürümü ──────────────────────────────────
INSERT INTO public.consumption_profiles (lab_id, name, is_template, is_active)
SELECT NULL, 'SIMAN Standart Tüketim Profili', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.consumption_profiles
   WHERE is_template AND name = 'SIMAN Standart Tüketim Profili');

INSERT INTO public.consumption_profile_versions (profile_id, version, status, valid_from)
SELECT p.id, 1, 'active', CURRENT_DATE
FROM public.consumption_profiles p
WHERE p.is_template AND p.name = 'SIMAN Standart Tüketim Profili'
  AND NOT EXISTS (
    SELECT 1 FROM public.consumption_profile_versions v WHERE v.profile_id = p.id);

-- ── 5) Şablon kuralları ────────────────────────────────────────────────────
-- Şablon lab'a özgü değil; production_material_id ve station_id lab bazlı
-- olduğu için şablon kuralları KOPYALAMA sırasında (clone RPC) çözülür.
-- Burada şablonun taşıyıcısı olarak lab'ın kendi malzeme/istasyonları kullanılır.
-- Tek laboratuvarlı kurulumda bu doğrudan çalışır; çok laboratuvarlıda clone
-- RPC'si kod eşleşmesiyle yeniden bağlar.
INSERT INTO public.consumption_rules
  (version_id, station_id, production_material_id, calc_model, qty, unit,
   conditions, sort_order, is_assumption, note)
SELECT
  v.id,
  (SELECT s.id FROM public.lab_stations s
    WHERE s.lab_profile_id = pm.lab_id AND s.name = r.station LIMIT 1),
  pm.id, r.calc_model, r.qty, r.unit, '{}'::jsonb, r.sort_order, r.is_assumption, r.note
FROM public.consumption_profiles p
JOIN public.consumption_profile_versions v ON v.profile_id = p.id AND v.version = 1
CROSS JOIN (VALUES
  -- ── GERÇEK ÜRETİM VERİSİ (consumptionRef.ts) ──────────────────────────
  ('ZIRCON_BLOCK',  'Frezeleme',          'disc_yield', 0.0303, 'adet', 10, false,
   'Disk kalınlığına göre çözülür (16 mm ≈ 33 kron). Varsayılan 16 mm.'),
  ('PMMA_DISC',     'Frezeleme',          'disc_yield', 0.0286, 'adet', 20, false,
   'Disk kalınlığına göre çözülür (16 mm ≈ 35 kron). Varsayılan 16 mm.'),
  ('PORCELAIN',     'Porselen & Make-up', 'per_tooth',  0.65,   'gr',   30, false,
   'Kron başına 0,3-1 gr aralığının ortalaması.'),
  ('GLASS_CERAMIC', 'Frezeleme',          'per_tooth',  1,      'adet', 40, false,
   '1 blok = 1 kron/veneer/inlay (birebir).'),
  ('TEMP_RESIN',    '3D Baskı',           'per_tooth',  11.76,  'gr',   50, false,
   'SprintRay Temporary Crown & Teeth: 1000 gr / 85 iş.'),
  ('SPLINT_RESIN',  '3D Baskı',           'fixed',      10,     'gr',   60, false,
   'SprintRay Night Guard: 1000 gr / 100 iş (vaka başına).'),
  ('MODEL_RESIN',   '3D Baskı',           'per_jaw',    39,     'ml',   70, false,
   'Tek çene 42 ml, çift çene 78 ml → çene başına 39 ml alındı (çift çenede birebir, tek çenede ~%7 düşük).'),
  -- ── BAŞLANGIÇ VARSAYIMLARI (laboratuvar düzeltmeli) ───────────────────
  ('STAIN',         'Porselen & Make-up', 'per_tooth',  0.05,   'gr',   80, true,
   'VARSAYIM — gerçek tüketim envanter doğrulamasıyla kalibre edilecek.'),
  ('GLAZE',         'Glaze',              'per_tooth',  0.1,    'gr',   90, true,
   'VARSAYIM — gerçek tüketim envanter doğrulamasıyla kalibre edilecek.'),
  ('PLASTER',       'Alçı Modelaj',       'per_jaw',    0.35,   'kg',  100, true,
   'VARSAYIM — çene başına alçı; laboratuvar düzeltmeli.'),
  ('MILLING_BUR',   'Frezeleme',          'per_tooth',  0.025,  'adet',110, true,
   'VARSAYIM — bir frez ucu ≈ 40 kron ömrü kabul edildi.')
) AS r(code, station, calc_model, qty, unit, sort_order, is_assumption, note)
JOIN public.production_materials pm ON pm.code = r.code
WHERE p.is_template AND p.name = 'SIMAN Standart Tüketim Profili'
  AND NOT EXISTS (
    SELECT 1 FROM public.consumption_rules cr
     WHERE cr.version_id = v.id AND cr.production_material_id = pm.id);
