-- Tüm satın alma faturalarının expenses tablosunda gider satırı olmasını GARANTİ eder.
--   1) Backfill: mevcut purchase_invoices kayıtları için eksik expense satırlarını yarat
--   2) Trigger: INSERT/UPDATE/DELETE üzerinde expenses senkron tutulur (RPC bypass edilse bile)

-- ── 1. Backfill ────────────────────────────────────────────────
INSERT INTO public.expenses (
  lab_id, category, description, amount, expense_date,
  payment_method, notes,
  currency, rate_at_time, amount_base, base_currency_at_time,
  purchase_invoice_id, created_by, created_at
)
SELECT
  pi.lab_id,
  'malzeme',
  'Fatura: ' || COALESCE(pi.invoice_number, '#') || ' · ' || pi.supplier_name,
  pi.total,
  pi.invoice_date,
  CASE pi.payment_method
    WHEN 'cash'     THEN 'nakit'
    WHEN 'card'     THEN 'kart'
    WHEN 'transfer' THEN 'havale'
    WHEN 'check'    THEN 'cek'
    ELSE 'havale'
  END,
  pi.notes,
  pi.currency,
  COALESCE(pi.rate_at_time, 1),
  COALESCE(pi.total_base, pi.total),
  COALESCE(pi.base_currency_at_time, 'TRY'),
  pi.id,
  pi.created_by,
  pi.created_at
FROM public.purchase_invoices pi
WHERE NOT EXISTS (
  SELECT 1 FROM public.expenses e WHERE e.purchase_invoice_id = pi.id
);

-- ── 2. Safety trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_purchase_invoice_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_method text;
BEGIN
  v_method := CASE NEW.payment_method
                WHEN 'cash'     THEN 'nakit'
                WHEN 'card'     THEN 'kart'
                WHEN 'transfer' THEN 'havale'
                WHEN 'check'    THEN 'cek'
                ELSE 'havale' END;

  IF (TG_OP = 'INSERT') THEN
    -- Sadece expense satırı yoksa yarat (RPC zaten ekledi ise duplicate olmasın)
    IF NOT EXISTS (SELECT 1 FROM public.expenses WHERE purchase_invoice_id = NEW.id) THEN
      INSERT INTO public.expenses (
        lab_id, category, description, amount, expense_date,
        payment_method, notes,
        currency, rate_at_time, amount_base, base_currency_at_time,
        purchase_invoice_id, created_by
      ) VALUES (
        NEW.lab_id, 'malzeme',
        'Fatura: ' || COALESCE(NEW.invoice_number, '#') || ' · ' || NEW.supplier_name,
        NEW.total, NEW.invoice_date,
        v_method, NEW.notes,
        NEW.currency, COALESCE(NEW.rate_at_time, 1),
        COALESCE(NEW.total_base, NEW.total),
        COALESCE(NEW.base_currency_at_time, 'TRY'),
        NEW.id, NEW.created_by
      );
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Tutar/tarih/yöntem değişirse expense satırı güncelle
    UPDATE public.expenses
    SET amount = NEW.total,
        amount_base = COALESCE(NEW.total_base, NEW.total),
        expense_date = NEW.invoice_date,
        payment_method = v_method,
        currency = NEW.currency,
        rate_at_time = COALESCE(NEW.rate_at_time, 1),
        base_currency_at_time = COALESCE(NEW.base_currency_at_time, 'TRY'),
        description = 'Fatura: ' || COALESCE(NEW.invoice_number, '#') || ' · ' || NEW.supplier_name,
        notes = NEW.notes,
        updated_at = NOW()
    WHERE purchase_invoice_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_purchase_invoice_to_expense ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_to_expense
  AFTER INSERT OR UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_invoice_to_expense();

-- NOT: expenses.purchase_invoice_id zaten ON DELETE CASCADE — purchase_invoice
-- silindiğinde expense satırı otomatik silinir (delete_purchase_invoice RPC zaten
-- expenses'ı manuel siliyor ama bu safety olarak burada da var).
