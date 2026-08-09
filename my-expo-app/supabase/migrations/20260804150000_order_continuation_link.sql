-- Sipariş devam bağlantısı — "Devam Siparişi" (planlı sonraki aşama, ör. geçici→nihai)
--
-- Bu bir REVİZYON değildir: teslim edilmiş bir işin planlı devamıdır.
-- Revizyon mekaniği (revision_of_id, garanti fiyatı, remake KPI) hiç değişmez;
-- devam siparişi normal yoldan (new-order insert) tam ücretli oluşur ve
-- yeniden-yapım oranına SAYILMAZ (KPI yalnız revision_of_id'ye bakar).
--
-- Additive + tek-lab'da NO-OP: yalnız 1 nullable kolon + 1 partial index.

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS continues_order_id uuid
    REFERENCES public.work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_continues_order_id
  ON public.work_orders(continues_order_id)
  WHERE continues_order_id IS NOT NULL;

COMMENT ON COLUMN public.work_orders.continues_order_id IS
  'Bu siparis, teslim edilmis baska bir siparisin planli DEVAMI (or. gecici->nihai). Revizyon DEGIL; kalite/yeniden-yapim KPI''ina sayilmaz.';
