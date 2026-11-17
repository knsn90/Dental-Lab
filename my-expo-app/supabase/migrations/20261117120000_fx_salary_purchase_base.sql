-- Kur hatası düzeltmesi (2026-11-17)
-- 1) sync_salary_to_expense: maaş giderini sabit 'TRY'/kur 1 ile yazıyordu; ana para
--    birimi EUR olunca ₺ tutar € sayılıyordu. Artık ödemenin para birimi + ödeme
--    tarihindeki kurla ana para birimine çevirir.
-- 2) create_purchase_invoice: formdaki elle kur "1 döviz = X TRY" anlamında; RPC bunu
--    doğrudan ana para birimi kuru sanıyordu (EUR fatura × 54). Fatura ana para
--    biriminde ise kur 1; ana para TRY değilse elle kur TRY köprüsüyle çevrilir.
-- Yedek: fx_backup_20261117.fn_defs

CREATE OR REPLACE FUNCTION public.sync_salary_to_expense()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_employee_name text;
  v_desc          text;
  v_method        text;
  v_cur           text;
  v_base          text;
  v_rate          numeric;
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

  v_cur := COALESCE(NULLIF(NEW.currency, ''), 'TRY');
  SELECT default_currency INTO v_base FROM public.lab_settings WHERE lab_id = NEW.lab_id;
  v_base := COALESCE(v_base, 'TRY');

  IF v_cur = v_base THEN
    v_rate := 1;
  ELSE
    v_rate := public.get_currency_rate(NEW.lab_id, v_cur, v_base, NEW.payment_date);
    IF v_rate IS NULL AND NEW.rate_at_time > 0 AND NEW.base_currency_at_time = v_base THEN
      v_rate := NEW.rate_at_time;
    END IF;
    IF v_rate IS NULL THEN
      RAISE EXCEPTION 'Kur tanımlı değil: % -> % (%) — önce döviz kurunu girin', v_cur, v_base, NEW.payment_date;
    END IF;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.expenses (
      lab_id, category, description, amount, expense_date,
      payment_method, currency, rate_at_time, amount_base, base_currency_at_time,
      salary_payment_id, created_by
    ) VALUES (
      NEW.lab_id, 'personel', v_desc, NEW.net_amount, NEW.payment_date,
      v_method, v_cur, v_rate, round(NEW.net_amount * v_rate, 2), v_base,
      NEW.id, NEW.created_by
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    UPDATE public.expenses
    SET amount = NEW.net_amount,
        currency = v_cur,
        rate_at_time = v_rate,
        amount_base = round(NEW.net_amount * v_rate, 2),
        base_currency_at_time = v_base,
        expense_date = NEW.payment_date,
        payment_method = v_method,
        description = v_desc,
        updated_at = NOW()
    WHERE salary_payment_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DO $mig$
DECLARE
  v_oid regprocedure := 'public.create_purchase_invoice(uuid,uuid,text,text,date,date,text,numeric,text,text,text,jsonb,numeric)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_old text := $o$  IF p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN v_rate := p_exchange_rate;
  ELSE$o$;
  v_new text := $n$  IF p_currency = v_base_currency THEN v_rate := 1;
  ELSIF p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN
    -- Formdaki kur "1 döviz = X TRY"; ana para birimi TRY değilse ana paraya çevir.
    IF v_base_currency = 'TRY' THEN v_rate := p_exchange_rate;
    ELSE
      v_rate := p_exchange_rate / NULLIF(public.get_currency_rate(p_lab_id, v_base_currency, 'TRY', p_invoice_date), 0);
      IF v_rate IS NULL THEN RAISE EXCEPTION 'Currency rate not defined for % -> TRY on % — fatura kurunu çeviremedim', v_base_currency, p_invoice_date; END IF;
    END IF;
  ELSE$n$;
BEGIN
  IF strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'create_purchase_invoice: beklenen kur bloğu bulunamadı';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
