-- Tedarikçi cari işlemlerine yapılan ödemeler için yapısal alanlar:
--   bank_name      — gönderen/alıcı banka adı
--   reference_no   — dekont / havale ref no
--   iban           — IBAN (alıcı veya gönderen)
-- Açıklama (description) artık serbest not için kalıyor.

ALTER TABLE public.supplier_transactions
  ADD COLUMN IF NOT EXISTS bank_name    text,
  ADD COLUMN IF NOT EXISTS reference_no text,
  ADD COLUMN IF NOT EXISTS iban         text;

-- RPC: record_supplier_transaction → yeni alanları kabul et
CREATE OR REPLACE FUNCTION public.record_supplier_transaction(
  p_lab_id          uuid,
  p_supplier_id     uuid,
  p_type            text,
  p_amount          numeric,
  p_currency        text DEFAULT 'TRY',
  p_payment_method  text DEFAULT NULL,
  p_invoice_no      text DEFAULT NULL,
  p_description     text DEFAULT NULL,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_due_date        date DEFAULT NULL,
  p_bank_name       text DEFAULT NULL,
  p_reference_no    text DEFAULT NULL,
  p_iban            text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_base_currency text;
  v_rate          numeric;
  v_base_amount   numeric;
  v_tx_id         uuid;
BEGIN
  IF p_type NOT IN ('PURCHASE','PAYMENT','RETURN','ADJUSTMENT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type;
  END IF;

  SELECT default_currency INTO v_base_currency
  FROM public.lab_settings
  WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_transaction_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> %', p_currency, v_base_currency;
  END IF;

  v_base_amount := p_amount * COALESCE(v_rate, 1);

  INSERT INTO public.supplier_transactions (
    lab_id, supplier_id, type, amount, currency,
    rate_at_time, amount_base, base_currency_at_time,
    invoice_no, payment_method, description,
    transaction_date, due_date,
    bank_name, reference_no, iban,
    created_by
  ) VALUES (
    p_lab_id, p_supplier_id, p_type, p_amount, p_currency,
    COALESCE(v_rate, 1), v_base_amount, v_base_currency,
    p_invoice_no, p_payment_method, p_description,
    p_transaction_date, p_due_date,
    p_bank_name, p_reference_no, p_iban,
    auth.uid()
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;
