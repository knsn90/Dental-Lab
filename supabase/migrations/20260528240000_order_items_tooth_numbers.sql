-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — order_items.tooth_numbers — diş-bazlı işlem haritası
--
-- order_items şu ana kadar sadece (service, quantity) tutuyordu. Hangi dişlerin
-- bu hizmete denk geldiği bilinmiyordu. Sipariş detayında "her işlem farklı
-- renk" gibi görselleştirme için diş listesi gerekli.
--
-- Yeni alan: tooth_numbers INTEGER[]
--   • NewOrderScreen submit, tooth_ops'u (work_type+shade+material) grupla.
--   • Her grup → 1 order_item, quantity = grup boyu, tooth_numbers = dişler.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tooth_numbers INTEGER[];

COMMENT ON COLUMN public.order_items.tooth_numbers IS
  'Bu hizmetin uygulandığı diş FDI numaraları. NULL ise eski kayıt (legacy).';

COMMIT;

NOTIFY pgrst, 'reload schema';
