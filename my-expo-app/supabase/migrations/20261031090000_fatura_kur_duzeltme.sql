-- Fatura kuru: baz dışı para birimindeki faturalar kur = 1 kalıyordu.
-- Neden: invoices.rate_at_time varsayılanı 1; set_invoice_amount_base() "rate_at_time > 0 ise elle girilmiş/kilitli kur"
-- sayıyordu → create_invoice_from_order / create_bulk_invoice / _scan_new_draft kur yazmadığı için TL/USD faturaları
-- EUR bazlı labda 1:1 EUR sayıldı (amount_base şişik; klinik tahsilatı dağıtımı TL'yi EUR gibi düşüyordu).
-- Geri alma: supabase/rollbacks/20261031090000_fatura_kur_duzeltme.down.sql

-- 1) Kur verilmeyen fatura NULL gelsin → tetikleyici kuru çeker
alter table public.invoices alter column rate_at_time drop default;

-- 2) Baz dışı parada 1 "ayarlanmamış" sayılır; para birimi değişip kur elle verilmediyse kur yeniden çekilir
create or replace function public.set_invoice_amount_base()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_base text;
  v_rate numeric;
begin
  select default_currency into v_base from public.lab_settings where lab_id = new.lab_id;
  if v_base is null then v_base := 'TRY'; end if;

  if coalesce(new.currency, v_base) = v_base then
    v_rate := 1;
  elsif new.rate_at_time is not null and new.rate_at_time > 0 and new.rate_at_time <> 1
        and not (tg_op = 'UPDATE' and new.currency is distinct from old.currency
                 and new.rate_at_time is not distinct from old.rate_at_time) then
    v_rate := new.rate_at_time;                 -- elle girilen / kilitli kur
  else
    v_rate := public.get_currency_rate(new.lab_id, new.currency, v_base, coalesce(new.issue_date, current_date));
    if v_rate is null or v_rate <= 0 then v_rate := 1; end if;
  end if;

  new.rate_at_time          := v_rate;
  new.base_currency_at_time := v_base;
  new.amount_base           := coalesce(new.total, 0) * v_rate;
  return new;
end;
$function$;

-- 3) Mevcut kur = 1 kalmış baz dışı faturalar: kesim tarihinin kuru (tetikleyici amount_base'i yeniden hesaplar)
update public.invoices i
   set rate_at_time = r.rate
  from (select id, public.get_currency_rate(lab_id, currency, base_currency_at_time, coalesce(issue_date, created_at::date)) as rate
          from public.invoices
         where currency <> base_currency_at_time and rate_at_time = 1) r
 where i.id = r.id and r.rate is not null and r.rate > 0 and r.rate <> 1;

-- 4) Bu faturalara faturanın kuru = 1 iken kaydedilmiş ödemeler: faturanın düzeltilmiş kuru
update public.payments p
   set rate_at_time          = i.rate_at_time,
       amount_base           = round(p.amount * i.rate_at_time, 2),
       base_currency_at_time = i.base_currency_at_time
  from public.invoices i
 where p.invoice_id = i.id
   and p.currency = i.currency
   and i.currency <> i.base_currency_at_time
   and p.rate_at_time = 1
   and i.rate_at_time <> 1;
