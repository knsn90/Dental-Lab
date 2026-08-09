-- ============================================================
-- 20260718150000 — stock_items.usable_stages
--
-- Malzeme ↔ aşama ilişkisi: bir stok kalemi hangi üretim aşamalarında
-- kullanılabilir (istasyon adları). Örn. Zirkonyum blok → {Frezeleme};
-- polisaj lastiği → {Polisaj}. Bir malzeme birden çok aşamada olabilir.
--
-- Malzeme onayı modalındaki "Stoktan seç" picker'ı bu alana göre filtreler:
--   • usable_stages bu istasyonu içeriyorsa → "bu aşamada" (üstte)
--   • boş/null → "genel" (gösterilir; henüz etiketlenmemiş)
--   • başka aşamalara etiketli → gizli ("Tümünü göster" ile erişilir)
--
-- Boş bırakmak güvenli (gün-1 regresyon yok). Eski consume_at_stage /
-- allowed_material_types alanlarına dokunulmadı.
-- ============================================================

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS usable_stages text[];

COMMENT ON COLUMN public.stock_items.usable_stages IS
  'Bu malzemenin kullanılabileceği üretim aşamaları (lab_stations.name listesi). NULL/boş = genel (her aşamada seçilebilir).';
