-- ============================================================================
-- Ölü tablo temizliği: stage_material_consumptions
--
-- Gerekçe (30 Tem 2026 doğrulaması):
--   • 0 satır — hiç kullanılmamış
--   • Hiçbir fonksiyon/view okumuyor veya yazmıyor (pg_proc.prosrc + pg_get_viewdef
--     taraması boş döndü)
--   • Gelen FK yok, üzerinde trigger yok
--   • İş akışının tek tüketim defteri stock_movements
--     (bkz. 20260731090000_inventory_d1_engine_core.sql)
--
-- NOT: log_stage_material() trigger fonksiyonu KORUNUR — o stock_movements
-- üzerinde çalışan aktif aktivite-log trigger'ıdır, bu tabloyla ilgisi yoktur.
-- ============================================================================

DROP TABLE IF EXISTS public.stage_material_consumptions;
