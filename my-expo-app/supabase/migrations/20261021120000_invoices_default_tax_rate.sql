-- Faturalarda KDV hep %0 çıkıyordu — 2026-10-21
--
-- SORUN: invoices.tax_rate sütun varsayılanı 0; faturayı oluşturan
-- create_invoice_from_order (tekil + teslimde otomatik taslak) ve
-- create_bulk_invoice KDV oranı YAZMIYOR → her fatura %0 (NexaDent'in 54
-- faturasının tamamı). Ayarlar → Finans'taki lab varsayılanı (default_tax_rate,
-- NexaDent %10) hiç kullanılmıyordu. %0 KDV'li fatura Luca'ya da gönderilemez.
--
-- ÇÖZÜM (tek nokta, fonksiyon gövdelerine dokunmadan): sütun varsayılanı
-- kaldırılır (NULL) ve BEFORE INSERT adımı oranı verilmemiş faturaya lab'ın
-- varsayılan KDV'sini yazar (ayar yoksa %20). Açıkça verilen oran (ör. ihracat
-- için 0) KORUNUR. Tutarlar kalem tetikleyicileriyle bu oranla hesaplanır;
-- sonradan oran değişirse recalc_on_tax_change yeniden hesaplar.
-- Ad sırası: auto_set_lab_id_invoices (lab_id) → invoices_default_tax_rate → set_*.

create or replace function public.invoices_default_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric;
begin
  if new.tax_rate is null then
    select ls.default_tax_rate into v_rate
      from public.lab_settings ls
     where ls.lab_id = new.lab_id;
    new.tax_rate := coalesce(v_rate, 20);
  end if;
  return new;
end;
$$;

revoke all on function public.invoices_default_tax_rate() from public, anon, authenticated;

alter table public.invoices alter column tax_rate drop default;

drop trigger if exists invoices_default_tax_rate on public.invoices;
create trigger invoices_default_tax_rate
  before insert on public.invoices
  for each row execute function public.invoices_default_tax_rate();
