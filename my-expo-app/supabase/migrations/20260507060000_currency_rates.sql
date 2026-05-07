-- ============================================================
-- 20260507 — Çoklu para birimi: kur tablosu + base currency desteği
--
-- Mimari:
--   • lab_settings.default_currency = base currency (zaten var, TRY default)
--   • currency_rates: tarih bazlı kur geçmişi (snapshot için)
--   • Bu migration sadece foundation — stock_movements / expenses
--     üzerine currency kolonu eklemek Phase 2/3'te gelir.
--
-- Snapshot yaklaşımı:
--   Movement girişinde günün kuru ile base currency değeri DONDURULUR
--   ve movement satırında saklanır. Sonradan kur değişse bile geçmiş
--   kayıtlar etkilenmez.
-- ============================================================

-- ── 1. currency_rates tablosu ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.currency_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  -- lab_id NULL olabilir → global rate (lab-specific override yoksa kullanılır)

  currency        text NOT NULL,                 -- 'EUR' | 'USD' | 'GBP' | 'TRY' | ...
  base_currency   text NOT NULL DEFAULT 'TRY',   -- "1 currency = X base"
  rate            numeric(18,6) NOT NULL,        -- 1 EUR = 38.0 TRY → rate=38.0
  effective_date  date NOT NULL,
  source          text NOT NULL DEFAULT 'manual',-- 'manual' | 'tcmb' | 'api' | 'system'
  notes           text,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT currency_rates_unique
    UNIQUE (lab_id, currency, base_currency, effective_date),
  CONSTRAINT currency_rates_positive CHECK (rate > 0),
  CONSTRAINT currency_rates_diff_currency CHECK (currency <> base_currency)
);

CREATE INDEX IF NOT EXISTS idx_currency_rates_lookup
  ON public.currency_rates (lab_id, currency, base_currency, effective_date DESC);

-- ── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rates_read"  ON public.currency_rates;
DROP POLICY IF EXISTS "currency_rates_write" ON public.currency_rates;

-- Read: kullanıcının lab'ı için + global (lab_id IS NULL)
CREATE POLICY "currency_rates_read"
  ON public.currency_rates
  FOR SELECT
  USING (
    lab_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = currency_rates.lab_id OR p.user_type = 'admin')
    )
  );

-- Write: sadece admin veya lab manager (lab_id eşleşmesi şart)
CREATE POLICY "currency_rates_write"
  ON public.currency_rates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.user_type = 'admin'
          OR (p.user_type = 'lab' AND p.role = 'manager' AND p.lab_id = currency_rates.lab_id)
        )
    )
  );

-- ── 3. Updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.currency_rates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_currency_rates_updated_at ON public.currency_rates;
CREATE TRIGGER trg_currency_rates_updated_at
  BEFORE UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.currency_rates_updated_at();

-- ── 4. Helper RPC: en güncel efektif kuru getir ─────────────
-- Belirli bir tarih için en yakın geçmiş kuru döner.
-- p_at_date verilmezse bugünün tarihi kullanılır.
-- Önce lab-specific bakar, yoksa global rate'e düşer.
CREATE OR REPLACE FUNCTION public.get_currency_rate(
  p_lab_id        uuid,
  p_currency      text,
  p_base_currency text DEFAULT 'TRY',
  p_at_date       date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_rate numeric;
BEGIN
  -- Aynı para birimi → 1
  IF p_currency = p_base_currency THEN
    RETURN 1;
  END IF;

  -- Lab-specific kur (en yakın geçmiş tarih)
  SELECT rate INTO v_rate
  FROM public.currency_rates
  WHERE lab_id = p_lab_id
    AND currency = p_currency
    AND base_currency = p_base_currency
    AND effective_date <= p_at_date
  ORDER BY effective_date DESC
  LIMIT 1;

  -- Yoksa global kur
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate
    FROM public.currency_rates
    WHERE lab_id IS NULL
      AND currency = p_currency
      AND base_currency = p_base_currency
      AND effective_date <= p_at_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;

  RETURN v_rate;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 5. lab_settings.default_currency için CHECK constraint ──
-- Mevcut kolon var ama desteklenen liste enforce edilmemiş.
ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_currency_check;

ALTER TABLE public.lab_settings
  ADD CONSTRAINT lab_settings_currency_check
    CHECK (default_currency IN ('TRY','EUR','USD','GBP'));

-- ── 6. Seed: bugün için varsayılan örnek kurlar (opsiyonel) ──
-- Production'da gerçek kur giriş edilene kadar fallback olarak duruyor.
-- (Bu satırlar kaldırılabilir — manual entry geldiğinde over-write olur.)
INSERT INTO public.currency_rates (lab_id, currency, base_currency, rate, effective_date, source, notes)
VALUES
  (NULL, 'EUR', 'TRY', 38.00, CURRENT_DATE, 'system', 'Foundation seed — gerçek kur girilene kadar'),
  (NULL, 'USD', 'TRY', 35.00, CURRENT_DATE, 'system', 'Foundation seed — gerçek kur girilene kadar'),
  (NULL, 'GBP', 'TRY', 44.00, CURRENT_DATE, 'system', 'Foundation seed — gerçek kur girilene kadar')
ON CONFLICT (lab_id, currency, base_currency, effective_date) DO NOTHING;

-- ============================================================
-- ✓ Phase 1 hazır:
--   • currency_rates tablosu + RLS + index
--   • get_currency_rate() RPC helper
--   • lab_settings base currency CHECK constraint
--   • Seed initial rates
-- ============================================================
