-- ============================================================================
-- Envanter D2 / Adım 2 — Üretim malzemesi seed'i
--
-- Kodlar laboratuvarın GERÇEK stok kalemlerinden türetildi (90 aktif kalem):
--   Seramik 46 (CZR dentin/enamel/luster, GC Initial, EX-3 stain, Optiglaze)
--   Zirkonyum 24 (DD Cube, Upcera)  ·  Freze 8  ·  Reçineler 5  ·  Alçı 3
--   Cam Seramik / PMMA 4
--
-- allowed_stations istasyon ADINDAN çözülür — id sabit yazılmaz (spec: reçete
-- marka/SKU bilmez, biz de istasyon id'si gömmeyiz).
-- Idempotent: ON CONFLICT (lab_id, code) DO NOTHING.
-- ============================================================================

INSERT INTO public.production_materials (lab_id, code, name, default_unit, allowed_stations)
SELECT l.id, m.code, m.name, m.unit,
       COALESCE(
         -- NOT: lab_stations'ın tenant kolonu `lab_profile_id` (→ labs.id)
         (SELECT array_agg(s.id) FROM public.lab_stations s
           WHERE s.lab_profile_id = l.id AND s.name = ANY(m.stations)),
         '{}')
FROM public.labs l
CROSS JOIN (VALUES
  ('ZIRCON_BLOCK',  'Zirkon Blok',            'adet', ARRAY['Frezeleme']),
  ('GLASS_CERAMIC', 'Cam Seramik Blok',       'adet', ARRAY['Frezeleme']),
  ('PMMA_DISC',     'PMMA / Geçici Disk',     'adet', ARRAY['Frezeleme']),
  ('WAX_DISC',      'Wax Disk',               'adet', ARRAY['Frezeleme']),
  ('MILLING_BUR',   'Freze Ucu',              'adet', ARRAY['Frezeleme']),
  ('PORCELAIN',     'Porselen (dentin/enamel)','gr',  ARRAY['Porselen & Make-up']),
  ('STAIN',         'Stain / Boya',           'gr',   ARRAY['Porselen & Make-up','Glaze']),
  ('GLAZE',         'Glaze',                  'gr',   ARRAY['Glaze']),
  ('MODEL_RESIN',   'Model Reçinesi',         'ml',   ARRAY['3D Baskı','3D Yazıcı Modelaj']),
  ('TEMP_RESIN',    'Geçici Kron Reçinesi',   'gr',   ARRAY['3D Baskı','3D Yazıcı Modelaj']),
  ('SPLINT_RESIN',  'Gece Plağı Reçinesi',    'gr',   ARRAY['3D Baskı','3D Yazıcı Modelaj']),
  ('PLASTER',       'Alçı',                   'kg',   ARRAY['Alçı Modelaj']),
  ('SINTER_BEAD',   'Sinter Boncuğu',         'gr',   ARRAY['Sinterleme']),
  ('POLISH',        'Polisaj Malzemesi',      'adet', ARRAY['Polisaj']),
  ('CASTING_ALLOY', 'Döküm Metali',           'gr',   ARRAY['Metal Döküm']),
  ('WASH_SOLVENT',  'Yıkama Solventi',        'ml',   ARRAY['Wash / Cure'])
) AS m(code, name, unit, stations)
ON CONFLICT (lab_id, code) DO NOTHING;
