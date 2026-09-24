-- Klinik toplu tahsilatı — fiş + satır tabloları.
--
-- NEDEN: payments.invoice_id NOT NULL olduğu için faturaya bağlanmamış tahsilat
-- girilemiyordu; üstelik payments_financial_guard ödeme para birimini faturanınkine
-- eşitliyor, yani EUR faturaya USD ödeme DB seviyesinde reddediliyordu. Fiş, kasaya
-- giren GERÇEK parayı (800 USD + 600 TL) kendi para biriminde saklar; faturaya
-- yazılan tahsis ayrı bir payments satırıdır ve faturanın para biriminde olur.
--
-- Bakiye zinciri (payments -> trigger -> invoices.paid_amount -> v_clinic_balance)
-- ve ödeme muhafızları BİLEREK değiştirilmedi.

CREATE TABLE IF NOT EXISTS public.clinic_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  receipt_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  text NOT NULL DEFAULT 'nakit'
                  CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  reference_no    text,
  notes           text,
  received_by     uuid REFERENCES public.profiles(id),
  base_currency   text NOT NULL CHECK (base_currency IN ('TRY','EUR','USD','GBP')),
  total_base      numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_base >= 0),
  allocated_base  numeric(14,2) NOT NULL DEFAULT 0 CHECK (allocated_base >= 0),
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_receipts_alloc_le_total CHECK (allocated_base <= total_base)
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_receipts_idem_uq
  ON public.clinic_receipts (lab_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS clinic_receipts_clinic_idx
  ON public.clinic_receipts (clinic_id, receipt_date DESC);

CREATE TABLE IF NOT EXISTS public.clinic_receipt_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid NOT NULL REFERENCES public.clinic_receipts(id) ON DELETE CASCADE,
  currency    text NOT NULL CHECK (currency IN ('TRY','EUR','USD','GBP')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  rate        numeric(18,6) NOT NULL CHECK (rate > 0),
  amount_base numeric(14,2) NOT NULL CHECK (amount_base > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_receipt_lines_receipt_idx
  ON public.clinic_receipt_lines (receipt_id);

-- Tahsisin hangi fişten geldiği. Fatura içi mevcut tahsilat akışında BOŞ kalır.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_id uuid
  REFERENCES public.clinic_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_receipt_idx
  ON public.payments (receipt_id) WHERE receipt_id IS NOT NULL;

-- lab_id'yi payments'taki kalıpla doldur (doğrudan INSERT'ler için emniyet).
DROP TRIGGER IF EXISTS auto_set_lab_id_clinic_receipts ON public.clinic_receipts;
CREATE TRIGGER auto_set_lab_id_clinic_receipts
  BEFORE INSERT ON public.clinic_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_lab_id();

ALTER TABLE public.clinic_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_receipt_lines ENABLE ROW LEVEL SECURITY;

-- payments politikalarıyla birebir aynı kalıp.
DROP POLICY IF EXISTS clinic_receipts_lab_select ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_select ON public.clinic_receipts
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS clinic_receipts_lab_insert ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_insert ON public.clinic_receipts
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipts_lab_update ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_update ON public.clinic_receipts
  FOR UPDATE USING (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipts_lab_delete ON public.clinic_receipts;
CREATE POLICY clinic_receipts_lab_delete ON public.clinic_receipts
  FOR DELETE USING (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND has_permission('manage_finance'))
  );

DROP POLICY IF EXISTS clinic_receipt_lines_lab_all ON public.clinic_receipt_lines;
CREATE POLICY clinic_receipt_lines_lab_all ON public.clinic_receipt_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.clinic_receipts r
             WHERE r.id = clinic_receipt_lines.receipt_id
               AND r.lab_id = get_my_lab_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.clinic_receipts r
             WHERE r.id = clinic_receipt_lines.receipt_id
               AND r.lab_id = get_my_lab_id())
  );
