-- 20261107100000_kesin_fatura_kilidi — geri alma
-- Migration yalnız yeni nesne ekledi; önceki tanım geri yazılmaz, yeni nesneler düşürülür.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS zzz_invoice_issued_lock ON public.invoices;
DROP TRIGGER IF EXISTS zzz_invoice_items_issued_lock ON public.invoice_items;

DROP FUNCTION IF EXISTS public._invoice_issued_lock();
DROP FUNCTION IF EXISTS public._invoice_items_issued_lock();

COMMIT;
