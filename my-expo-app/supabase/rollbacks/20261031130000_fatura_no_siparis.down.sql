-- Geri alma: 20261031130000_fatura_no_siparis.sql → canlı ÖNCE hâli (verilmiş numaralar değişmez)
drop trigger if exists zz_bulk_invoice_number on public.invoice_orders;
drop function if exists public._trg_bulk_invoice_number();

CREATE OR REPLACE FUNCTION public.set_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := next_invoice_number(NEW.lab_id);
  END IF;
  RETURN NEW;
END;
$function$;

drop function if exists public._order_invoice_number(uuid, uuid);
