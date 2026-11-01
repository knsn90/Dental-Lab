-- Klinik tahsilatı dağıtımı: aynı para birimi önce, kur dönüşümü yok.
-- Eski kural her satırı baza çevirip faturanın KESİM günü kuruyla geri çeviriyordu → 16.445 TL ödeme
-- 16.445 TL borcu kapatmıyor, son faturada kur farkı artığı kalıyordu (FTR-2026-00063'te 54,19 TL).
-- Yeni kural (tek plan, hem kayıt hem önizleme kullanır):
--   1) Her satır kendi para birimindeki açık faturaları en eski vadeden başlayarak AYNI parayla kapatır.
--   2) Kalan baz tutar eski kurala göre (baz → faturanın kuru) diğer faturalara gider.
-- Alacak uygulamada (apply_clinic_credit; makbuzun zaten ödemesi varsa) yalnız 2. adım çalışır — eskisi gibi.
-- Geri alma: supabase/rollbacks/20261031100000_tahsilat_ayni_para_dagitim.down.sql

create or replace function public._receipt_alloc_plan(p_clinic_id uuid, p_lines jsonb, p_base numeric)
returns table (invoice_id uuid, invoice_no text, currency text, amount numeric, rate numeric, amount_base numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rem       numeric := coalesce(p_base, 0);
  v_taken     jsonb := '{}'::jsonb;   -- bu planda faturadan alınan (fatura parasıyla)
  g           record;
  inv         record;
  v_amt_rem   numeric;
  v_gbase_rem numeric;
  v_take      numeric;
  v_used      numeric;
  v_open      numeric;
begin
  -- 1) Aynı para birimi
  for g in
    select l->>'currency' as cur,
           sum((l->>'amount')::numeric) as amt,
           sum(round((l->>'amount')::numeric * (l->>'rate')::numeric, 2)) as base
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
     where coalesce((l->>'amount')::numeric, 0) > 0 and coalesce((l->>'rate')::numeric, 0) > 0
     group by l->>'currency'
     order by min(l->>'currency')
  loop
    v_amt_rem   := g.amt;
    v_gbase_rem := least(g.base, v_rem);
    for inv in
      select i.id, i.invoice_number, i.total - i.paid_amount as open
        from public.invoices i
       where i.clinic_id = p_clinic_id and i.currency = g.cur
         and i.status in ('kesildi', 'kismi_odendi') and i.total > i.paid_amount
       order by i.due_date asc nulls last, i.created_at asc, i.id asc
    loop
      exit when v_amt_rem <= 0 or v_gbase_rem <= 0;
      v_take := least(inv.open, v_amt_rem);
      -- Satır bu faturada bitiyorsa grubun kalan bazının tamamı (yuvarlama artığı kalmaz)
      v_used := case when v_take >= v_amt_rem then v_gbase_rem
                     else least(round(v_take * g.base / g.amt, 2), v_gbase_rem) end;
      invoice_id := inv.id; invoice_no := inv.invoice_number; currency := g.cur;
      amount := v_take; rate := round(g.base / g.amt, 8); amount_base := v_used;
      return next;
      v_taken     := jsonb_set(v_taken, array[inv.id::text],
                               to_jsonb(coalesce((v_taken->>inv.id::text)::numeric, 0) + v_take));
      v_amt_rem   := v_amt_rem - v_take;
      v_gbase_rem := v_gbase_rem - v_used;
      v_rem       := v_rem - v_used;
    end loop;
  end loop;

  -- 2) Kalan baz: eski kural (baz → faturanın kuru), tüm para birimleri
  for inv in
    select i.id, i.invoice_number, i.currency, i.total - i.paid_amount as open, coalesce(i.rate_at_time, 1) as r
      from public.invoices i
     where i.clinic_id = p_clinic_id
       and i.status in ('kesildi', 'kismi_odendi') and i.total > i.paid_amount
     order by i.due_date asc nulls last, i.created_at asc, i.id asc
  loop
    exit when v_rem <= 0;
    v_open := inv.open - coalesce((v_taken->>inv.id::text)::numeric, 0);
    continue when v_open <= 0;
    v_take := least(floor(v_rem / inv.r * 100) / 100, v_open);
    continue when v_take <= 0;
    v_used := round(v_take * inv.r, 2);
    invoice_id := inv.id; invoice_no := inv.invoice_number; currency := inv.currency;
    amount := v_take; rate := inv.r; amount_base := v_used;
    return next;
    v_rem := v_rem - v_used;
  end loop;
end $$;

revoke all on function public._receipt_alloc_plan(uuid, jsonb, numeric) from public, anon, authenticated;

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

create or replace function public.preview_clinic_receipt(p_clinic_id uuid, p_lines jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_lab   uuid;
  v_total numeric;
  v_used  numeric;
  v_rows  jsonb;
begin
  select lab_id into v_lab from public.clinics where id = p_clinic_id;
  if v_lab is null then raise exception 'Klinik bulunamadı'; end if;
  if not (public.is_platform_admin()
          or (v_lab = public.get_my_lab_id() and public.has_permission('manage_finance'))) then
    raise exception 'Yetkiniz yok';
  end if;

  v_total := public.receipt_lines_total_base(p_lines);

  select coalesce(sum(p.amount_base), 0),
         coalesce(jsonb_agg(jsonb_build_object('invoice_id', p.invoice_id, 'invoice_no', p.invoice_no,
                                               'amount', p.amount, 'currency', p.currency)), '[]'::jsonb)
    into v_used, v_rows
    from public._receipt_alloc_plan(p_clinic_id, p_lines, v_total) p;

  return jsonb_build_object('total_base', v_total,
    'allocated_base', v_used, 'credit_base', v_total - v_used, 'allocations', v_rows);
end $function$;

-- Veri: 2026-10-31 19:38 makbuzu (16.445 TL, havale) yeni kurala göre baştan dağıtılır.
-- Durum: eski dağıtım FTR-2026-00063'e 1.760,81 TL yazmıştı; o ödeme sonradan silindi → makbuzda 2 ödeme
-- kaldı ama allocated_base 294,63'te kaldı. Kalan ödemeler kaldırılır, makbuz yeniden dağıtılır
-- (6.380 + 8.250 + 1.815 = 16.445 TL), allocated_base gerçek dağıtıma eşitlenir.
do $$
declare
  r       record;
  v_alloc numeric;
begin
  select * into r from public.clinic_receipts where id = '23fee05b-672b-46eb-9d74-cf4d9d6c4fc3';
  if not found
     or (select coalesce(sum(amount), 0) from public.clinic_receipt_lines where receipt_id = r.id and currency = 'TRY') <> 16445
     or exists (select 1 from public.clinic_receipt_lines where receipt_id = r.id and currency <> 'TRY') then
    raise notice 'makbuz 23fee05b beklenen durumda değil — veri düzeltmesi atlandı';
    return;
  end if;
  delete from public.payments where receipt_id = r.id;
  v_alloc := public.alloc_receipt_to_invoices(r.id, r.clinic_id, r.total_base, r.base_currency, r.receipt_date, r.payment_method);
  update public.clinic_receipts set allocated_base = v_alloc, updated_at = now() where id = r.id;
end $$;
