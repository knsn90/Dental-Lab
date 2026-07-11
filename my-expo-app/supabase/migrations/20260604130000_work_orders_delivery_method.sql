-- ============================================================
-- work_orders.delivery_method — sipariş oluştururken seçilen TESLİM ŞEKLİ.
-- Değerler: 'kurye' (iç/dış kurye), 'kargo' (dış kargo), 'elden' (elden teslim).
-- Nullable: eski siparişlerde NULL kalır → bugünkü davranış (kurye akışı) korunur.
--
-- Sipariş detayında kurye aşamasının açılıp açılmayacağını ve "Kuryeye Gönder"
-- modalının modunu (kargo → sadece dış) bu alan belirler.
-- ============================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS delivery_method text;

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_delivery_method_check;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_delivery_method_check
  CHECK (delivery_method IS NULL OR delivery_method IN ('kurye', 'kargo', 'elden'));

COMMENT ON COLUMN public.work_orders.delivery_method IS
  'Teslim şekli: kurye | kargo | elden. NULL = belirtilmemiş (eski siparişler).';
