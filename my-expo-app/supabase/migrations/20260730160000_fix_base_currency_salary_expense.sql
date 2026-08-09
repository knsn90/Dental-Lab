-- ============================================================
-- 20260730 — Maaş/Gider amount_base'ini EUR baz'a doğru çevir (K1)
--
-- Sorun: Lab baz para birimi EUR; ancak ₺-baz döneminden kalan salary_payments /
-- expenses kayıtlarının türetilmiş `amount_base`'i (raporların topladığı EUR-karşılığı)
-- yanlıştı → profitability_summary İşçilik €530.000, Gider €137.273, Net Kâr −€666.496.
--   • ₺ kayıtlar: amount_base = ₺ tutarı (EUR sanılıyordu)
--   • € giderler: amount_base ≈ tutar × 53 (aşırı çevrilmiş)
-- ORİJİNAL amount + currency HER ZAMAN korunur; yalnız türetilmiş amount_base düzeltilir.
--
-- Kur: TCMB 30.07.2026 EUR döviz satış = 54.3250 (1 ₺ = 1/54.3250 ≈ 0.01840773 EUR).
-- Geçmiş kayıtlar o günkü kurdaydı → güncel kurla çevirim YAKLAŞIKTIR (UI'de "≈" notu).
--
-- İleriye dönük: currency_rates'e TRY→EUR global kuru eklenir ki get_currency_rate
-- (ve set_invoice_amount_base gibi tetikleyiciler) yeni kayıtları doğru hesaplasın.
-- NOT: kur zamana bağlı; bu migration kayıt amaçlıdır (tek seferlik veri onarımı).
-- ============================================================

-- İleriye dönük TRY→EUR global kuru (yoksa ekle)
INSERT INTO public.currency_rates (lab_id, currency, base_currency, rate, effective_date)
SELECT NULL, 'TRY', 'EUR', ROUND(1/54.3250, 8), CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM public.currency_rates
  WHERE lab_id IS NULL AND currency='TRY' AND base_currency='EUR'
);

-- Geçmiş amount_base onarımı (amount/currency SABİT):
UPDATE public.salary_payments SET amount_base = ROUND(gross_amount / 54.3250, 2)
WHERE currency = 'TRY' AND (amount_base IS NULL OR amount_base = gross_amount);

UPDATE public.expenses SET amount_base = ROUND(amount / 54.3250, 2)
WHERE currency = 'TRY' AND (amount_base IS NULL OR amount_base = amount);

UPDATE public.expenses SET amount_base = amount
WHERE currency = 'EUR' AND amount_base IS DISTINCT FROM amount;
