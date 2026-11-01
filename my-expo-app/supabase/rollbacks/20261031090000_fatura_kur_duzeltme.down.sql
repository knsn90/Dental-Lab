-- Geri alma: 20261031090000_fatura_kur_duzeltme.sql → canlı ÖNCE hâli (bkz. .before.txt)
-- Sıra: önce eski fonksiyon (kur=1'i "kilitli" sayar), sonra veriyi 1'e döndür → amount_base = total.

CREATE OR REPLACE FUNCTION public.set_invoice_amount_base()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base text;
  v_rate numeric;
BEGIN
  SELECT default_currency INTO v_base FROM public.lab_settings WHERE lab_id = NEW.lab_id;
  IF v_base IS NULL THEN v_base := 'TRY'; END IF;

  IF COALESCE(NEW.currency, v_base) = v_base THEN
    v_rate := 1;
  ELSIF NEW.rate_at_time IS NOT NULL AND NEW.rate_at_time > 0 THEN
    v_rate := NEW.rate_at_time;                 -- elle girilen / kilitli kur
  ELSE
    v_rate := public.get_currency_rate(NEW.lab_id, NEW.currency, v_base, COALESCE(NEW.issue_date, CURRENT_DATE));
    IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1; END IF;
  END IF;

  NEW.rate_at_time          := v_rate;
  NEW.base_currency_at_time := v_base;
  NEW.amount_base           := COALESCE(NEW.total, 0) * v_rate;
  RETURN NEW;
END;
$function$;

alter table public.invoices alter column rate_at_time set default 1;

-- Ödemeler (varsa): düzeltilen faturaların fatura para birimindeki ödemeleri eski 1:1 hâline
update public.payments p
   set rate_at_time = 1, amount_base = p.amount
  from public.invoices i
 where p.invoice_id = i.id and p.currency = i.currency and p.rate_at_time = i.rate_at_time
   and i.id in (
  '1f04ee44-ad3f-49c3-bae3-ccf381fe18e6',
  'd6cabb3d-6293-4f0b-9568-7037ff430c24',
  '1957d018-f663-4938-bf33-84c2caf5c393',
  '45850d5c-c65a-4af2-a950-c167e47e871a',
  'bee48811-8a16-48c3-88fd-b63a663b1066',
  '2f4572ef-c6f3-424d-be02-2597c4906396',
  'd88d5cb1-30a1-471a-bf83-230eb10c60c2',
  '4dad9ce0-d403-42a3-a1ce-ec9e82d0754d',
  '74d94c53-e7de-4cd6-942a-fe61f62ae4ce',
  '018e2e7a-4849-4936-8262-4cf987582acb',
  'aba4e31f-8cce-47b3-8419-48f56507417a',
  '5c1e916a-cc6e-431e-8b1d-748d66185633'
);

update public.invoices set rate_at_time = 1 where id in (
  '1f04ee44-ad3f-49c3-bae3-ccf381fe18e6',
  'd6cabb3d-6293-4f0b-9568-7037ff430c24',
  '1957d018-f663-4938-bf33-84c2caf5c393',
  '45850d5c-c65a-4af2-a950-c167e47e871a',
  'bee48811-8a16-48c3-88fd-b63a663b1066',
  '2f4572ef-c6f3-424d-be02-2597c4906396',
  'd88d5cb1-30a1-471a-bf83-230eb10c60c2',
  '4dad9ce0-d403-42a3-a1ce-ec9e82d0754d',
  '74d94c53-e7de-4cd6-942a-fe61f62ae4ce',
  '018e2e7a-4849-4936-8262-4cf987582acb',
  'aba4e31f-8cce-47b3-8419-48f56507417a',
  '5c1e916a-cc6e-431e-8b1d-748d66185633'
);
