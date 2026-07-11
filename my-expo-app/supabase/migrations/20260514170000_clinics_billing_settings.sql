-- Faz 2 — Klinik bazlı faturalama ayarları:
--   • billing_mode              — her teslim için ayrı fatura mı, yoksa toplu mu?
--   • default_payment_terms_days — bu klinik için varsayılan vade (gün)
--   • next_billing_due_date      — opsiyonel: bir sonraki toplu fatura tahmini tarihi
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'monthly_bulk'
    CHECK (billing_mode IN ('per_order', 'monthly_bulk')),
  ADD COLUMN IF NOT EXISTS default_payment_terms_days int NOT NULL DEFAULT 30
    CHECK (default_payment_terms_days >= 0 AND default_payment_terms_days <= 365);

COMMENT ON COLUMN public.clinics.billing_mode IS
  'per_order: her teslim ayrı fatura. monthly_bulk: ay sonu toplu fatura (default).';
COMMENT ON COLUMN public.clinics.default_payment_terms_days IS
  'Bu kliniğe kesilen fatura için varsayılan vade — fatura tarihi + bu gün sayısı.';
