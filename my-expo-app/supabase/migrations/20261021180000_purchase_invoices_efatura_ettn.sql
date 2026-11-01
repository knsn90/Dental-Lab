-- Gelen e-fatura → alış faturası (2026-10-21)
--
-- Tedarikçinin Luca'dan gelen e-faturası mevcut Alış Faturası formuyla kaydedilir.
-- Aynı e-fatura İKİ KEZ aktarılamaz: ETTN alış faturasında saklanır, lab başına tekil.
--
-- create_purchase_invoice'a DOKUNULMAZ (çalışan akış). Sarmalayıcı aynı işlemde
-- faturayı kurar ve ETTN'yi yazar; ETTN çakışırsa (yarış dahil, tekil indeks)
-- hepsi geri alınır — yarım kayıt / çift stok girişi kalmaz.
-- SECURITY INVOKER: RLS (purchase_invoices_write + tenant_guard) aynen geçerli.

alter table public.purchase_invoices add column if not exists efatura_ettn text;

create unique index if not exists purchase_invoices_lab_efatura_ettn_uq
  on public.purchase_invoices (lab_id, lower(efatura_ettn))
  where efatura_ettn is not null;

create or replace function public.create_purchase_invoice_from_efatura(
  p_lab_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_vat_rate numeric,
  p_payment_method text,
  p_invoice_file_url text,
  p_notes text,
  p_lines jsonb,
  p_exchange_rate numeric,
  p_efatura_ettn text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ettn text := lower(trim(coalesce(p_efatura_ettn, '')));
  v_id   uuid;
begin
  if v_ettn !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Geçersiz ETTN';
  end if;
  if exists (
    select 1 from public.purchase_invoices
    where lab_id = p_lab_id and lower(efatura_ettn) = v_ettn
  ) then
    raise exception 'Bu e-fatura zaten alış faturası olarak kaydedildi';
  end if;

  v_id := public.create_purchase_invoice(
    p_lab_id, p_supplier_id, p_supplier_name, p_invoice_number, p_invoice_date, p_due_date,
    p_currency, p_vat_rate, p_payment_method, p_invoice_file_url, p_notes, p_lines, p_exchange_rate
  );

  update public.purchase_invoices set efatura_ettn = v_ettn where id = v_id;
  if not found then
    raise exception 'Alış faturası oluşturulamadı';
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_purchase_invoice_from_efatura(
  uuid, uuid, text, text, date, date, text, numeric, text, text, text, jsonb, numeric, text
) from public, anon;
grant execute on function public.create_purchase_invoice_from_efatura(
  uuid, uuid, text, text, date, date, text, numeric, text, text, text, jsonb, numeric, text
) to authenticated;
