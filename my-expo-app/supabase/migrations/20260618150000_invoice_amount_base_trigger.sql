-- ════════════════════════════════════════════════════════════════════════════
-- FIX: faturalarda amount_base hesaplanmıyordu → gelir raporu yanlış.
--
--   v_monthly_finance_summary income = COALESCE(invoices.amount_base, invoices.total).
--   Satış faturası akışı amount_base'i HİÇ doldurmuyordu → EUR fatura (€420) ham
--   total=420 olarak TRY gibi sayılıyordu (gelir düşük/yanlış).
--
--   ÇÖZÜM: invoices'a BEFORE INSERT/UPDATE trigger — amount_base = total × kur.
--   Kur: faturanın para birimi = baz ise 1; değilse get_currency_rate (currency_rates
--   tablosundaki manuel kayıt VARSA o, yoksa TCMB'den çekilen günün kuru). issue_date
--   günün kuru kullanılır. base_currency_at_time + rate_at_time de yazılır.
--   Toplam (total) item-recalc trigger'ıyla değiştiğinde bu trigger tekrar çalışır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_invoice_amount_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_base text;
  v_rate numeric;
BEGIN
  SELECT default_currency INTO v_base FROM public.lab_settings WHERE lab_id = NEW.lab_id;
  IF v_base IS NULL THEN v_base := 'TRY'; END IF;

  IF COALESCE(NEW.currency, v_base) = v_base THEN
    v_rate := 1;
  ELSE
    v_rate := public.get_currency_rate(NEW.lab_id, NEW.currency, v_base, COALESCE(NEW.issue_date, CURRENT_DATE));
    IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1; END IF;  -- kur yoksa güvenli fallback
  END IF;

  NEW.rate_at_time          := v_rate;
  NEW.base_currency_at_time  := v_base;
  NEW.amount_base            := COALESCE(NEW.total, 0) * v_rate;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_invoice_amount_base_trg ON public.invoices;
CREATE TRIGGER set_invoice_amount_base_trg
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_amount_base();

-- Mevcut faturaları yeniden hesapla (trigger'ı tetikle).
UPDATE public.invoices SET updated_at = now();
