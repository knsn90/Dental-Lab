-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — lab_settings: acil vaka ek ücret oranı (%)
--
-- Yeni siparişte "Acil vaka" toggle'ı açıldığında nihai faturaya buradaki
-- oran kadar ek ücret eklenir. Mali İşler → Fiyat Listesi ekranından
-- belirlenir (lab başına tek değer).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS urgent_surcharge_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lab_settings.urgent_surcharge_rate IS
  'Acil vaka için faturaya eklenen yüzde oranı (0–100). Sipariş acil işaretlendiyse net tutara bu oran uygulanır.';

COMMIT;

NOTIFY pgrst, 'reload schema';
