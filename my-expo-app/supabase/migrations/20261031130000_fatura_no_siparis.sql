-- Fatura numarası = "F-" + sipariş numarası (kullanıcı: "fatura numaraları sipariş numaralarıyla aynı olsa daha iyi
-- olur, sadece önek eklenir"). Tek siparişli fatura: F-NEX-2026-0192 (aynı siparişe ikinci fatura: -2, -3 …).
-- Birden çok siparişli (toplu) fatura: eskisi gibi FTR-YYYY-NNNNN sırası. Mevcut faturaların numarası DEĞİŞMEZ.
-- Mevcut fonksiyonlar (create_invoice_from_order, create_bulk_invoice, next_invoice_number) değişmez:
--   • set_invoice_number: work_order_id doluysa sipariş numarasından üretir, değilse FTR sırası
--   • invoice_orders'a AYNI işlemde 2. sipariş bağlanınca (toplu fatura) numara FTR sırasına çevrilir
-- Geri alma: supabase/rollbacks/20261031130000_fatura_no_siparis.down.sql

create or replace function public._order_invoice_number(p_lab uuid, p_work_order uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_no   text;
  v_base text;
  v_try  text;
  v_i    int := 1;
begin
  select btrim(order_number) into v_no from public.work_orders where id = p_work_order;
  if v_no is null or v_no = '' then return null; end if;
  v_base := 'F-' || v_no;
  v_try  := v_base;
  while exists (select 1 from public.invoices where lab_id = p_lab and invoice_number = v_try) loop
    v_i   := v_i + 1;
    v_try := v_base || '-' || v_i;
  end loop;
  return v_try;
end $$;

revoke all on function public._order_invoice_number(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_invoice_number()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    if new.work_order_id is not null then
      new.invoice_number := public._order_invoice_number(new.lab_id, new.work_order_id);
    end if;
    if new.invoice_number is null or new.invoice_number = '' then
      new.invoice_number := next_invoice_number(new.lab_id);
    end if;
  end if;
  return new;
end;
$function$;

-- Toplu fatura: aynı işlemde oluşturulan faturaya 2. sipariş bağlanınca sipariş-numaralı ad FTR sırasına döner
create or replace function public._trg_bulk_invoice_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv record;
begin
  select id, lab_id, invoice_number, created_at into v_inv from public.invoices where id = new.invoice_id;
  if v_inv.invoice_number like 'F-%'
     and v_inv.created_at = now()   -- yalnız bu işlemde oluşan fatura (sonradan bağlanan siparişte numara değişmez)
     and (select count(*) from public.invoice_orders where invoice_id = new.invoice_id) > 1 then
    update public.invoices set invoice_number = public.next_invoice_number(v_inv.lab_id) where id = new.invoice_id;
  end if;
  return null;
end $$;

revoke all on function public._trg_bulk_invoice_number() from public, anon, authenticated;

create trigger zz_bulk_invoice_number
  after insert on public.invoice_orders
  for each row execute function public._trg_bulk_invoice_number();
