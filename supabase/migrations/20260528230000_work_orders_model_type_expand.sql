-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — work_orders.model_type CHECK constraint genişletildi
--
-- Eski (4): dijital, fiziksel, fotograf, cad
-- Yeni manuel: silikon_olcu, aljinat_olcu, fiziksel_model, baski_3d_model,
--              mevcut_protez_referansi, wax_up, hibrit_olcu_stl
-- Yeni dijital: dijital_tarama, stl_dosyasi, cad_dosyasi
--
-- NewOrderScreen MODEL_TYPES_MANUAL + MODEL_TYPES_DIGITAL ile aynı set.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_model_type_check;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_model_type_check
  CHECK (
    model_type IS NULL
    OR model_type = ANY (ARRAY[
      -- Legacy değerler — geriye dönük uyumluluk
      'dijital', 'fiziksel', 'fotograf', 'cad',
      -- Manuel ölçüm seçenekleri
      'silikon_olcu', 'aljinat_olcu', 'fiziksel_model', 'baski_3d_model',
      'mevcut_protez_referansi', 'wax_up', 'hibrit_olcu_stl',
      -- Dijital ölçüm seçenekleri
      'dijital_tarama', 'stl_dosyasi', 'cad_dosyasi'
    ]::text[])
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
