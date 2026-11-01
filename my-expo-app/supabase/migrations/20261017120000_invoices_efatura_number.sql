-- Entegratörün verdiği resmi e-fatura numarası (Luca/GİB, ör. NEX2026000000001).
-- invoices.invoice_number Siman'ın iç numarası olarak kalır; ETTN efatura_uuid'de.
-- Yalnız ekleme: mevcut satırlar NULL, RLS/politika değişmez.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS efatura_number text;

COMMENT ON COLUMN public.invoices.efatura_number IS
  'Entegratörün (Luca) verdiği resmi e-Fatura/e-Arşiv numarası; efatura-luca edge function yazar.';
