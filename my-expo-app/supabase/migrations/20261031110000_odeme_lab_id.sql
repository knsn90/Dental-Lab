-- Ödeme lab_id: makbuz dağıtımı (alloc_receipt_to_invoices) ödemenin lab'ını yazmıyordu; auto_set_lab_id oturum
-- lab'ını kullandığından oturumsuz çağrıda (migration / sistem) lab_id NULL kaldı → ödeme lab RLS'inde görünmedi
-- (2026-10-31 yeniden dağıtılan 16.445 TL makbuzu ekstrede kayboldu; 2026-09-24'ten 2 ödeme aynı durumda).
-- Geri alma: supabase/rollbacks/20261031110000_odeme_lab_id.down.sql

create or replace function public.alloc_receipt_to_invoices(p_receipt_id uuid, p_clinic_id uuid, p_base numeric, p_base_ccy text, p_date date, p_method text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_alloc numeric := 0;
  v_lab   uuid;
  pl      record;
begin
  -- Ödemenin lab'ı kliniğin lab'ı: auto_set_lab_id oturum lab'ına dayanır, oturumsuz (sistem) çağrıda NULL kalıyordu
  select lab_id into v_lab from public.clinics where id = p_clinic_id;

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
    insert into public.payments (lab_id, invoice_id, amount, payment_date, payment_method,
                                 currency, rate_at_time, amount_base, base_currency_at_time,
                                 receipt_id, received_by)
    values (v_lab, pl.invoice_id, pl.amount, p_date, p_method,
            pl.currency, pl.rate, pl.amount_base, p_base_ccy,
            p_receipt_id, auth.uid());
    v_alloc := v_alloc + pl.amount_base;
  end loop;
  return v_alloc;
end $function$;

-- lab_id'si boş ödemeler: faturanın lab'ı
update public.payments p
   set lab_id = i.lab_id
  from public.invoices i
 where p.invoice_id = i.id and p.lab_id is null and i.lab_id is not null;
