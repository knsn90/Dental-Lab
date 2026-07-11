-- Maaş ödemeleri ve avanslar otomatik olarak expenses tablosuna yansıtılır.
-- Böylece finans raporundaki "Toplam Gider" doğru hesaplanır.
--
-- Pattern: purchase_invoice_id ile aynı (audit link). Trigger'lar INSERT/UPDATE/DELETE
-- olaylarında expenses satırını senkron tutar.

-- ── 1. Link kolonları ──────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS salary_payment_id uuid REFERENCES public.salary_payments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS advance_id        uuid REFERENCES public.employee_advances(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expenses_salary  ON public.expenses(salary_payment_id) WHERE salary_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_advance ON public.expenses(advance_id)        WHERE advance_id        IS NOT NULL;

-- ── 2. Salary payment → expenses sync ──────────────────────────
CREATE OR REPLACE FUNCTION public.sync_salary_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_name text;
  v_desc          text;
  v_method        text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.expenses WHERE salary_payment_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT full_name INTO v_employee_name FROM public.employees WHERE id = NEW.employee_id;
  v_desc := format('Maaş ödemesi: %s · %s/%s',
                   COALESCE(v_employee_name, '—'),
                   LPAD(NEW.period_month::text, 2, '0'),
                   NEW.period_year);
  v_method := CASE NEW.payment_method
                WHEN 'nakit'  THEN 'nakit'
                WHEN 'kart'   THEN 'kart'
                WHEN 'havale' THEN 'havale'
                ELSE 'havale' END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.expenses (
      lab_id, category, description, amount, expense_date,
      payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
      salary_payment_id, created_by
    ) VALUES (
      NEW.lab_id, 'personel', v_desc, NEW.net_amount, NEW.payment_date,
      v_method, 'TRY', 1, NEW.net_amount, 'TRY',
      NEW.id, NEW.created_by
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    UPDATE public.expenses
    SET amount = NEW.net_amount,
        amount_base = NEW.net_amount,
        expense_date = NEW.payment_date,
        payment_method = v_method,
        description = v_desc,
        updated_at = NOW()
    WHERE salary_payment_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_salary_to_expense ON public.salary_payments;
CREATE TRIGGER trg_salary_to_expense
  AFTER INSERT OR UPDATE OR DELETE ON public.salary_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_salary_to_expense();

-- ── 3. Employee advance → expenses sync ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_advance_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_name text;
  v_desc          text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.expenses WHERE advance_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT full_name INTO v_employee_name FROM public.employees WHERE id = NEW.employee_id;
  v_desc := format('Avans: %s%s',
                   COALESCE(v_employee_name, '—'),
                   CASE WHEN NEW.description IS NOT NULL AND length(NEW.description) > 0
                        THEN ' · ' || NEW.description ELSE '' END);

  IF (TG_OP = 'INSERT') THEN
    -- Avans maaştan kesildiyse gider olarak yazma (maaş zaten brüt üzerinden gider yazıyor)
    IF NEW.is_deducted = FALSE THEN
      INSERT INTO public.expenses (
        lab_id, category, description, amount, expense_date,
        payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
        advance_id
      ) VALUES (
        NEW.lab_id, 'personel', v_desc, NEW.amount, NEW.advance_date,
        'nakit', 'TRY', 1, NEW.amount, 'TRY',
        NEW.id
      );
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Avans maaştan kesildiyse expenses satırını sil (çift sayım önlenir)
    IF NEW.is_deducted = TRUE AND (OLD.is_deducted IS DISTINCT FROM TRUE) THEN
      DELETE FROM public.expenses WHERE advance_id = NEW.id;
    ELSIF NEW.is_deducted = FALSE THEN
      -- Hâlâ aktif avans — bilgileri güncelle (ya da yoksa ekle)
      IF EXISTS (SELECT 1 FROM public.expenses WHERE advance_id = NEW.id) THEN
        UPDATE public.expenses
        SET amount = NEW.amount,
            amount_base = NEW.amount,
            expense_date = NEW.advance_date,
            description = v_desc,
            updated_at = NOW()
        WHERE advance_id = NEW.id;
      ELSE
        INSERT INTO public.expenses (
          lab_id, category, description, amount, expense_date,
          payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
          advance_id
        ) VALUES (
          NEW.lab_id, 'personel', v_desc, NEW.amount, NEW.advance_date,
          'nakit', 'TRY', 1, NEW.amount, 'TRY', NEW.id
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_advance_to_expense ON public.employee_advances;
CREATE TRIGGER trg_advance_to_expense
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_advances
  FOR EACH ROW EXECUTE FUNCTION public.sync_advance_to_expense();

-- ── 4. Geriye dönük: mevcut maaş + avans kayıtlarını expenses'a aktar ──
-- Mevcut salary_payments için expenses yoksa ekle
INSERT INTO public.expenses (
  lab_id, category, description, amount, expense_date,
  payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
  salary_payment_id, created_by, created_at
)
SELECT
  sp.lab_id, 'personel',
  format('Maaş ödemesi: %s · %s/%s',
         COALESCE(e.full_name, '—'),
         LPAD(sp.period_month::text, 2, '0'),
         sp.period_year),
  sp.net_amount, sp.payment_date,
  CASE sp.payment_method
    WHEN 'nakit'  THEN 'nakit'
    WHEN 'kart'   THEN 'kart'
    ELSE 'havale' END,
  'TRY', 1, sp.net_amount, 'TRY',
  sp.id, sp.created_by, sp.created_at
FROM public.salary_payments sp
LEFT JOIN public.employees e ON e.id = sp.employee_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.expenses x WHERE x.salary_payment_id = sp.id
);

-- Mevcut kesilmemiş avanslar için expenses yoksa ekle
INSERT INTO public.expenses (
  lab_id, category, description, amount, expense_date,
  payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
  advance_id, created_at
)
SELECT
  a.lab_id, 'personel',
  format('Avans: %s%s',
         COALESCE(e.full_name, '—'),
         CASE WHEN a.description IS NOT NULL AND length(a.description) > 0
              THEN ' · ' || a.description ELSE '' END),
  a.amount, a.advance_date,
  'nakit', 'TRY', 1, a.amount, 'TRY',
  a.id, a.created_at
FROM public.employee_advances a
LEFT JOIN public.employees e ON e.id = a.employee_id
WHERE a.is_deducted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM public.expenses x WHERE x.advance_id = a.id
  );
