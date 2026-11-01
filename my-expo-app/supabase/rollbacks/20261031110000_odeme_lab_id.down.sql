-- Geri alma: 20261031110000_odeme_lab_id.sql → ÖNCE hâli
create or replace function public.alloc_receipt_to_invoices(p_receipt_id uuid, p_clinic_id uuid, p_base numeric, p_base_ccy text, p_date date, p_method text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_alloc numeric := 0;
  pl      record;
begin
  -- Eşzamanlı tahsilatlar aynı faturayı iki kez kapatmasın
  perform 1 from public.invoices
   where clinic_id = p_clinic_id and status in ('kesildi', 'kismi_odendi') and total > paid_amount
   for update;

  -- İlk dağıtım (makbuzun henüz ödemesi yok) → satırlar aynı para kuralıyla; sonraki alacak uygulamaları yalnız baz
  if not exists (select 1 from public.payments where receipt_id = p_receipt_id) then
    select coalesce(jsonb_agg(jsonb_build_object('currency', l.currency, 'amount', l.amount, 'rate', l.rate)), '[]'::jsonb)
      into v_lines
      from public.clinic_receipt_lines l
     where l.receipt_id = p_receipt_id;
  end if;

  for pl in select * from public._receipt_alloc_plan(p_clinic_id, v_lines, p_base) loop
    insert into public.payments (invoice_id, amount, payment_date, payment_method,
                                 currency, rate_at_time, amount_base, base_currency_at_time,
                                 receipt_id, received_by)
    values (pl.invoice_id, pl.amount, p_date, p_method,
            pl.currency, pl.rate, pl.amount_base, p_base_ccy,
            p_receipt_id, auth.uid());
    v_alloc := v_alloc + pl.amount_base;
  end loop;
  return v_alloc;
end $function$;

update public.payments set lab_id = null where id in (
  'f4b50806-fb7d-45cc-bb7d-8e727d5cc401',
  'db2f5907-1843-47ab-9138-4288284ea180',
  'feb10e2e-b1dc-4fb1-a46a-0bba0e6d74bd',
  '8b6b2269-8852-4d63-8b18-9ff3da655e0d',
  '83d7a956-1719-4394-a435-1a9b12188e0b'
);
