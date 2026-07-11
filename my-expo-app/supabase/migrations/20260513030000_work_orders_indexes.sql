-- Sipariş listesi sorgularını hızlandır: arşiv filtresi + delivery_date sıralama.
CREATE INDEX IF NOT EXISTS idx_work_orders_active_delivery
  ON public.work_orders (delivery_date ASC)
  WHERE is_archived IS NULL OR is_archived = FALSE;

-- Status filtresiyle birlikte sık kullanılır
CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON public.work_orders (status, delivery_date ASC);

-- Hekim bazlı liste
CREATE INDEX IF NOT EXISTS idx_work_orders_doctor
  ON public.work_orders (doctor_id, created_at DESC)
  WHERE doctor_id IS NOT NULL;

-- Lab bazlı liste
CREATE INDEX IF NOT EXISTS idx_work_orders_lab
  ON public.work_orders (lab_id, delivery_date ASC)
  WHERE lab_id IS NOT NULL;

ANALYZE public.work_orders;
