-- 20261107100000_kesin_fatura_kilidi
-- Kesinleşmiş fatura kilidi (status <> 'taslak'; 'iptal' dahil).
--   * Yasak sütunlar (P1) değişemez; kesinleşmişten 'taslak'a ve 'iptal'den çıkış yasak (P2).
--   * Kesinleşmiş fatura silinemez; kalemleri eklenemez/değişemez/silinemez.
--   * FK zincirleri (P3): clinic/doctor SET NULL, labs CASCADE, fatura→kalem CASCADE,
--     order_items SET NULL çalışmayı sürdürür.
--   * Kaçış (P4) yalnız işlem-yerel siman.invoice_lock = 'off'. current_user istisnası YOK.
--   * Hata (P5): 'INV_ISSUED_LOCKED', ERRCODE 42501.
-- Tetikleyiciler zzz_ önekli → diğer BEFORE tetikleyicilerinden (aa_enforce_invoice_totals,
-- set_invoice_amount_base_trg, zz_*) SONRA çalışır ve son NEW değerini görür.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public._invoice_issued_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('siman.invoice_lock', true), '') = 'off' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'taslak' THEN
      RETURN OLD;
    END IF;
    -- labs ON DELETE CASCADE zinciri: lab satırı artık yok
    IF NOT EXISTS (SELECT 1 FROM public.labs l WHERE l.id = OLD.lab_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  -- UPDATE
  IF OLD.status = 'taslak' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'taslak' THEN
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'iptal' AND NEW.status IS DISTINCT FROM 'iptal' THEN
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  IF (NEW.lab_id, NEW.currency, NEW.invoice_number, NEW.issue_date,
      NEW.subtotal, NEW.tax_rate, NEW.tax_amount, NEW.total,
      NEW.discount_type, NEW.discount_value, NEW.discount_amount)
     IS DISTINCT FROM
     (OLD.lab_id, OLD.currency, OLD.invoice_number, OLD.issue_date,
      OLD.subtotal, OLD.tax_rate, OLD.tax_amount, OLD.total,
      OLD.discount_type, OLD.discount_value, OLD.discount_amount) THEN
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  -- clinics ON DELETE SET NULL zinciri: yalnız NULL'a ve hedef satır artık yoksa
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     AND NOT (NEW.clinic_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = OLD.clinic_id)) THEN
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  -- doctors ON DELETE SET NULL zinciri: yalnız NULL'a ve hedef satır artık yoksa
  IF NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
     AND NOT (NEW.doctor_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = OLD.doctor_id)) THEN
    RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._invoice_items_issued_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_issued boolean := false;
BEGIN
  IF COALESCE(current_setting('siman.invoice_lock', true), '') = 'off' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- İlgili ana faturalar: INSERT → NEW, DELETE → OLD, UPDATE → HEM OLD HEM NEW
  -- (kalemi kesinleşmiş faturadan taslağa taşımak ya da taslaktan kesinleşmişe taşımak yasak).
  -- Ana fatura yoksa (fatura→kalem CASCADE zinciri) o taraf kilit saymaz.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_issued := EXISTS (SELECT 1 FROM public.invoices i
                         WHERE i.id = OLD.invoice_id AND i.status IS DISTINCT FROM 'taslak');
  END IF;
  IF NOT v_issued AND TG_OP IN ('INSERT', 'UPDATE') THEN
    v_issued := EXISTS (SELECT 1 FROM public.invoices i
                         WHERE i.id = NEW.invoice_id AND i.status IS DISTINCT FROM 'taslak');
  END IF;

  IF NOT v_issued THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- order_items ON DELETE SET NULL zinciri: yalnız order_item_id NULL'a dönüyor ve sipariş kalemi yok
  -- (invoice_id değişmemiş olmalı — aşağıdaki karşılaştırmada invoice_id de var)
  IF TG_OP = 'UPDATE'
     AND OLD.order_item_id IS NOT NULL
     AND NEW.order_item_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = OLD.order_item_id)
     AND (NEW.invoice_id, NEW.description, NEW.quantity, NEW.unit_price, NEW.sort_order,
          NEW.discount_type, NEW.discount_value, NEW.list_unit_price, NEW.list_discount_pct)
         IS NOT DISTINCT FROM
         (OLD.invoice_id, OLD.description, OLD.quantity, OLD.unit_price, OLD.sort_order,
          OLD.discount_type, OLD.discount_value, OLD.list_unit_price, OLD.list_discount_pct) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'INV_ISSUED_LOCKED' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public._invoice_issued_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._invoice_items_issued_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_invoice_issued_lock ON public.invoices;
CREATE TRIGGER zzz_invoice_issued_lock
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public._invoice_issued_lock();

DROP TRIGGER IF EXISTS zzz_invoice_items_issued_lock ON public.invoice_items;
CREATE TRIGGER zzz_invoice_items_issued_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public._invoice_items_issued_lock();

COMMIT;
