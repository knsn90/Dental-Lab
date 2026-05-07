-- ============================================================
-- 20260507 — Phase 3: Mali İşlemler'e çoklu para birimi
--
-- Etkilenen tablolar:
--   • expenses               (giderler)
--   • recurring_expenses     (tekrarlayan giderler)
--   • payments               (fatura ödemeleri)
--   • salary_payments        (maaş ödemeleri)
--   • checks                 (çekler)
--   • invoices               (faturalar)
--
-- Her tabloya:
--   currency               text                — orijinal para birimi
--   rate_at_time           numeric(18,6)       — kayıt anındaki kur (snapshot)
--   amount_base            numeric             — base currency'de değer (snapshot)
--   base_currency_at_time  text                — kayıt anındaki base currency
--
-- Snapshot stratejisi: kayıt zamanında o günün kuru DONDURULUR.
-- Geçmiş kayıtlar kur değişiminden etkilenmez.
--
-- Idempotent — tekrar çalıştırılabilir.
-- ============================================================

-- ── Helper: bir tabloya currency kolonlarını ekle ──
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'expenses', 'recurring_expenses', 'payments',
      'salary_payments', 'checks', 'invoices'
    ])
  LOOP
    -- currency
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS currency text DEFAULT ''TRY''',
      t
    );
    -- rate_at_time
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS rate_at_time numeric(18,6) DEFAULT 1',
      t
    );
    -- amount_base
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS amount_base numeric',
      t
    );
    -- base_currency_at_time
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS base_currency_at_time text DEFAULT ''TRY''',
      t
    );

    -- CHECK constraint
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_currency_check'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency IN (''TRY'',''EUR'',''USD'',''GBP''))',
      t, t || '_currency_check'
    );
  END LOOP;
END $$;

-- ── Backfill: mevcut kayıtlar için TRY=1, amount_base=amount ──
-- expenses: amount kolonu var
UPDATE public.expenses
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, amount)
WHERE amount_base IS NULL;

-- recurring_expenses: amount kolonu var
UPDATE public.recurring_expenses
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, amount)
WHERE amount_base IS NULL;

-- payments: amount kolonu var
UPDATE public.payments
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, amount)
WHERE amount_base IS NULL;

-- salary_payments: gross_amount kolonu var (amount değil)
UPDATE public.salary_payments
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, gross_amount)
WHERE amount_base IS NULL;

-- checks: amount kolonu var
UPDATE public.checks
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, amount)
WHERE amount_base IS NULL;

-- invoices: total kolonu var (amount değil)
UPDATE public.invoices
SET currency = COALESCE(currency, 'TRY'),
    rate_at_time = COALESCE(rate_at_time, 1),
    base_currency_at_time = COALESCE(base_currency_at_time, 'TRY'),
    amount_base = COALESCE(amount_base, total)
WHERE amount_base IS NULL;

-- ── Index for currency-based queries ────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_currency_date
  ON public.expenses (currency, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_currency_date
  ON public.payments (currency, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_currency_date
  ON public.invoices (currency, issue_date DESC);

-- ── Generic snapshot RPC for finance entries ────────────────
-- Frontend, currency + amount + table + tarih gönderir.
-- RPC, lab'in base currency'sini ve günün kurunu okur,
-- amount_base'i hesaplar ve INSERT yapar.
--
-- NOT: Pratik nedenden ötürü her tablo için ayrı INSERT yerine
-- frontend kendi INSERT'ünü yaparken kuru kendisi hesaplar.
-- Bu RPC sadece "snapshot helper" olarak çalışır:
-- frontend get_currency_rate'i çağırıp amount_base'i kendi hesaplar.
-- Bu daha esnek bir API; karmaşık tablo şemalarına gerek yok.

-- Yardımcı: bir miktar + currency için snapshot kur değerini döner.
-- Frontend bunu çağırıp amount_base = amount * rate hesaplar.
CREATE OR REPLACE FUNCTION public.get_snapshot_rate(
  p_lab_id        uuid,
  p_currency      text,
  p_at_date       date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rate           numeric,
  base_currency  text
) AS $$
DECLARE
  v_base text;
  v_rate numeric;
BEGIN
  -- Lab base currency
  SELECT default_currency INTO v_base
  FROM public.lab_settings
  WHERE lab_id = p_lab_id;
  IF v_base IS NULL THEN v_base := 'TRY'; END IF;

  -- Aynı para birimi → 1
  IF p_currency = v_base THEN
    rate := 1;
    base_currency := v_base;
    RETURN NEXT;
    RETURN;
  END IF;

  -- get_currency_rate kullan
  v_rate := public.get_currency_rate(p_lab_id, p_currency, v_base, p_at_date);

  rate := v_rate;
  base_currency := v_base;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- ✓ Phase 3 hazır:
--   • 6 finance tablosuna currency + rate_at_time + amount_base
--   • Mevcut kayıtlar TRY=1 backfill
--   • Index: currency + date
--   • get_snapshot_rate() helper RPC
-- ============================================================
