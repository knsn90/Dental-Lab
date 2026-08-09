-- 20260720100000 — Tedarikçi carisi kendi para biriminde (hesap para birimi) tutulur
-- ─────────────────────────────────────────────────────────────────────────────
-- SORUN: Tedarikçi EUR fatura kesiyor, biz bir kez ₺ bir kez $ ödüyoruz. Cari
-- bakiye `amount_base` (₺'ye çevrilmiş) üzerinden netleşiyordu; ayrıca view'daki
-- `balance_original` yalnız `currency = default_currency` satırlarını sayıp
-- diğer para birimlerindeki ödemeleri SESSİZCE DÜŞÜRÜYORDU (yanlış bakiye).
--
-- ÇÖZÜM: Her hareket, tedarikçinin cari para birimine (suppliers.default_currency)
-- çevrilmiş tutarıyla da saklanır. Kur GİRİŞ ANINDA snapshot'lanır ve kullanıcı
-- tarafından ELLE girilebilir (create_purchase_invoice.p_exchange_rate deseni).
--
-- KUR YÖNÜ (net tanım): account_rate_at_time = 1 birim HESAP para biriminin kaç
-- birim İŞLEM para birimi ettiği.  Örn. EUR cariye ₺ ödeme, 1 EUR = 38,50 ₺ →
-- account_rate_at_time = 38.50 ve amount_account = amount / 38.50.
-- İşlem para birimi = hesap para birimi ise rate = 1 (birebir).
--
-- KORUNAN: `amount_base` / `base_currency_at_time` (₺) ve tüm şirket-geneli
-- raporlama DOKUNULMADI. default_currency = base olan tedarikçilerde davranış
-- birebir aynı (account = base) → gün-1 regresyon yok.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Kolonlar (additive) ───────────────────────────────────────────────────
ALTER TABLE public.supplier_transactions
  ADD COLUMN IF NOT EXISTS amount_account           numeric,
  ADD COLUMN IF NOT EXISTS account_rate_at_time     numeric(18,6),
  ADD COLUMN IF NOT EXISTS account_currency_at_time text;

COMMENT ON COLUMN public.supplier_transactions.account_rate_at_time IS
  '1 birim hesap para biriminin kaç birim işlem para birimi ettiği (1 EUR = 38.50 TRY → 38.50). Hesap=işlem ise 1.';
COMMENT ON COLUMN public.supplier_transactions.amount_account IS
  'İşlem tutarının tedarikçi cari para birimine çevrilmiş hali = amount / account_rate_at_time.';

-- ── 2) Backfill — mevcut satırlar ────────────────────────────────────────────
-- Çapraz kurdan türetme:  1 ACCT = rate_acct_base BASE,  1 TXCCY = rate_at_time BASE
--   → account_rate_at_time = rate_acct_base / rate_at_time
--   → amount_account       = amount_base    / rate_acct_base
UPDATE public.supplier_transactions st
SET account_currency_at_time = s.default_currency,
    account_rate_at_time = CASE
      WHEN st.currency = s.default_currency THEN 1
      ELSE COALESCE(
        CASE WHEN s.default_currency = COALESCE(st.base_currency_at_time, 'TRY') THEN 1
             ELSE public.get_currency_rate(st.lab_id, s.default_currency,
                                           COALESCE(st.base_currency_at_time, 'TRY'),
                                           st.transaction_date) END, 1)
           / NULLIF(COALESCE(st.rate_at_time, 1), 0)
    END,
    amount_account = CASE
      WHEN st.currency = s.default_currency THEN st.amount
      ELSE COALESCE(st.amount_base, st.amount) / NULLIF(COALESCE(
        CASE WHEN s.default_currency = COALESCE(st.base_currency_at_time, 'TRY') THEN 1
             ELSE public.get_currency_rate(st.lab_id, s.default_currency,
                                           COALESCE(st.base_currency_at_time, 'TRY'),
                                           st.transaction_date) END, 1), 0)
    END
FROM public.suppliers s
WHERE s.id = st.supplier_id
  AND st.amount_account IS NULL;

-- ── 3) RPC — elle kur (p_account_rate) ───────────────────────────────────────
-- 13-arg sürüm DROP edilip 14-arg olarak yeniden yaratılır. (CREATE OR REPLACE
-- parametre EKLEYEMEZ; trailing DEFAULT'lu yeni overload bırakılırsa 13 adlı
-- argümanla çağrı "function is not unique" hatası verirdi.)
-- SECURITY INVOKER korunur (orijinal prosecdef=false).
DROP FUNCTION IF EXISTS public.record_supplier_transaction(
  uuid, uuid, text, numeric, text, text, text, text, date, date, text, text, text);

CREATE OR REPLACE FUNCTION public.record_supplier_transaction(
  p_lab_id           uuid,
  p_supplier_id      uuid,
  p_type             text,
  p_amount           numeric,
  p_currency         text DEFAULT 'TRY'::text,
  p_payment_method   text DEFAULT NULL::text,
  p_invoice_no       text DEFAULT NULL::text,
  p_description      text DEFAULT NULL::text,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_due_date         date DEFAULT NULL::date,
  p_bank_name        text DEFAULT NULL::text,
  p_reference_no     text DEFAULT NULL::text,
  p_iban             text DEFAULT NULL::text,
  p_account_rate     numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_base_currency  text;
  v_acct_currency  text;
  v_rate           numeric;   -- 1 p_currency = v_rate BASE
  v_rate_acct_base numeric;   -- 1 ACCT       = v_rate_acct_base BASE
  v_acct_rate      numeric;   -- 1 ACCT       = v_acct_rate p_currency
  v_base_amount    numeric;
  v_acct_amount    numeric;
  v_tx_id          uuid;
BEGIN
  IF p_type NOT IN ('PURCHASE','PAYMENT','RETURN','ADJUSTMENT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type;
  END IF;

  SELECT default_currency INTO v_base_currency
  FROM public.lab_settings WHERE lab_id = p_lab_id;
  IF v_base_currency IS NULL THEN v_base_currency := 'TRY'; END IF;

  -- ── BASE (₺) tarafı — DEĞİŞMEDİ ──
  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base_currency, p_transaction_date);
  IF v_rate IS NULL AND p_currency <> v_base_currency THEN
    RAISE EXCEPTION 'Currency rate not defined for % -> %', p_currency, v_base_currency;
  END IF;
  v_rate := COALESCE(v_rate, 1);
  v_base_amount := p_amount * v_rate;

  -- ── HESAP (cari) para birimi tarafı — YENİ ──
  SELECT default_currency INTO v_acct_currency
  FROM public.suppliers WHERE id = p_supplier_id;
  IF v_acct_currency IS NULL THEN v_acct_currency := v_base_currency; END IF;

  IF p_currency = v_acct_currency THEN
    v_acct_rate := 1;
  ELSIF p_account_rate IS NOT NULL AND p_account_rate > 0 THEN
    v_acct_rate := p_account_rate;                       -- kullanıcının elle girdiği kur
  ELSE
    v_rate_acct_base := CASE
      WHEN v_acct_currency = v_base_currency THEN 1
      ELSE public.get_currency_rate(p_lab_id, v_acct_currency, v_base_currency, p_transaction_date)
    END;
    IF v_rate_acct_base IS NULL OR v_rate = 0 THEN
      RAISE EXCEPTION 'Kur tanimli degil: % -> % (kuru elle girebilirsiniz)', p_currency, v_acct_currency;
    END IF;
    v_acct_rate := v_rate_acct_base / v_rate;
  END IF;

  v_acct_amount := p_amount / NULLIF(v_acct_rate, 0);

  INSERT INTO public.supplier_transactions (
    lab_id, supplier_id, type, amount, currency,
    rate_at_time, amount_base, base_currency_at_time,
    amount_account, account_rate_at_time, account_currency_at_time,
    invoice_no, payment_method, description,
    transaction_date, due_date,
    bank_name, reference_no, iban,
    created_by
  ) VALUES (
    p_lab_id, p_supplier_id, p_type, p_amount, p_currency,
    v_rate, v_base_amount, v_base_currency,
    v_acct_amount, v_acct_rate, v_acct_currency,
    p_invoice_no, p_payment_method, p_description,
    p_transaction_date, p_due_date,
    p_bank_name, p_reference_no, p_iban,
    auth.uid()
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$function$;

-- ── 4) View — cari para biriminde bakiye + toplamlar ─────────────────────────
-- security_invoker=on KORUNUR. Mevcut kolon adları/sırası aynı; yeni kolonlar
-- sona eklendi. `balance_original` ARTIK DOĞRU: eskiden yalnız default_currency
-- satırlarını sayıp diğerlerini düşürüyordu, şimdi hepsi hesap para biriminde.
CREATE OR REPLACE VIEW public.supplier_balances
WITH (security_invoker = on) AS
SELECT s.id AS supplier_id,
       s.lab_id,
       s.name,
       s.default_currency,
       COALESCE(sum(CASE
         WHEN st.type = 'PURCHASE'                          THEN st.amount_base
         WHEN st.type = ANY (ARRAY['PAYMENT','RETURN'])     THEN - st.amount_base
         WHEN st.type = 'ADJUSTMENT'                        THEN st.amount_base
         ELSE 0::numeric END), 0::numeric) AS balance_base,
       COALESCE(sum(CASE WHEN st.type = 'PURCHASE' THEN st.amount_base ELSE 0::numeric END), 0::numeric) AS total_purchases,
       COALESCE(sum(CASE WHEN st.type = 'PAYMENT'  THEN st.amount_base ELSE 0::numeric END), 0::numeric) AS total_payments,
       COALESCE(sum(CASE WHEN st.type = 'RETURN'   THEN st.amount_base ELSE 0::numeric END), 0::numeric) AS total_returns,
       count(st.id) FILTER (WHERE st.type = 'PURCHASE') AS purchase_count,
       max(st.transaction_date) AS last_transaction_date,
       -- cari (hesap) para biriminde net bakiye — eski bozuk tanımın yerine
       COALESCE(sum(CASE
         WHEN st.type = 'PURCHASE'                      THEN COALESCE(st.amount_account, st.amount_base)
         WHEN st.type = ANY (ARRAY['PAYMENT','RETURN']) THEN - COALESCE(st.amount_account, st.amount_base)
         WHEN st.type = 'ADJUSTMENT'                    THEN COALESCE(st.amount_account, st.amount_base)
         ELSE 0::numeric END), 0::numeric) AS balance_original,
       COALESCE(sum(CASE
         WHEN st.type = 'PURCHASE'                      THEN COALESCE(st.amount_account, st.amount_base)
         WHEN st.type = ANY (ARRAY['PAYMENT','RETURN']) THEN - COALESCE(st.amount_account, st.amount_base)
         WHEN st.type = 'ADJUSTMENT'                    THEN COALESCE(st.amount_account, st.amount_base)
         ELSE 0::numeric END), 0::numeric) AS balance_account,
       COALESCE(sum(CASE WHEN st.type = 'PURCHASE' THEN COALESCE(st.amount_account, st.amount_base) ELSE 0::numeric END), 0::numeric) AS total_purchases_account,
       COALESCE(sum(CASE WHEN st.type = 'PAYMENT'  THEN COALESCE(st.amount_account, st.amount_base) ELSE 0::numeric END), 0::numeric) AS total_payments_account,
       COALESCE(sum(CASE WHEN st.type = 'RETURN'   THEN COALESCE(st.amount_account, st.amount_base) ELSE 0::numeric END), 0::numeric) AS total_returns_account
FROM public.suppliers s
LEFT JOIN public.supplier_transactions st ON st.supplier_id = s.id
GROUP BY s.id, s.lab_id, s.name, s.default_currency;

NOTIFY pgrst, 'reload schema';
