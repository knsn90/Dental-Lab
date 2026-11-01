-- Geri alma: 20261029090000_nakit_kasa_duzeltme.sql → 20261028151000/152000 hâli (fonksiyon gövdeleri o dosyalardan birebir)
-- Not: düzeltmenin yazdığı salary_payment / advance hareketleri kalır; gerekiyorsa ayrıca silinir.

drop trigger if exists zz_cash_sync_salary on public.salary_payments;
drop trigger if exists zz_cash_sync_advance on public.employee_advances;
drop function if exists public._trg_cash_sync_salary();
drop function if exists public._trg_cash_sync_advance();

create or replace function public._cash_sync(p_ref_type text, p_ref_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lab     uuid;
  v_cur     text;
  v_amt     numeric;
  v_date    date;
  v_created timestamptz;
  v_dir     text;
  v_cat     text;
  v_desc    text;
  v_ok      boolean;
  v_dr      public.cash_accounts;
begin
  if p_ref_type = 'payment' then
    select coalesce(p.lab_id, i.lab_id), coalesce(p.currency, i.currency), p.amount, p.payment_date, p.created_at,
           'giris', 'tahsilat', 'Tahsilat · ' || coalesce(i.invoice_number, ''),
           (p.payment_method = 'nakit' and p.receipt_id is null and i.status <> 'iptal')
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where p.id = p_ref_id;
  elsif p_ref_type = 'clinic_receipt_line' then
    select r.lab_id, l.currency, l.amount, r.receipt_date, l.created_at,
           'giris', 'tahsilat', 'Makbuz · ' || coalesce(c.name, ''),
           (r.payment_method = 'nakit')
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.clinic_receipt_lines l
      join public.clinic_receipts r on r.id = l.receipt_id
      left join public.clinics c on c.id = r.clinic_id
     where l.id = p_ref_id;
  elsif p_ref_type = 'expense' then
    select e.lab_id, e.currency, e.amount, e.expense_date, e.created_at,
           'cikis',
           case when e.salary_payment_id is not null or e.advance_id is not null or e.category = 'personel' then 'maas'
                when e.category in ('kira', 'malzeme', 'vergi') then e.category
                else 'odeme' end,
           'Gider · ' || coalesce(e.description, ''),
           (e.payment_method = 'nakit' and e.purchase_invoice_id is null and e.delivery_id is null
            and e.recurring_template_id is null)
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.expenses e
     where e.id = p_ref_id;
  else
    return;
  end if;

  if v_ok is true and coalesce(v_amt, 0) > 0 then
    v_dr := public._cash_drawer(v_lab, v_cur);
    if v_dr.id is not null and v_created > coalesce(v_dr.opened_at, '-infinity'::timestamptz) then
      insert into public.cash_movements
             (lab_id, account_id, direction, amount, movement_date, category, description, ref_type, ref_id)
      values (v_lab, v_dr.id, v_dir, v_amt, v_date, v_cat, v_desc, p_ref_type, p_ref_id)
      on conflict (ref_type, ref_id) where ref_type is not null do update
         set lab_id        = excluded.lab_id,
             account_id    = excluded.account_id,
             direction     = excluded.direction,
             amount        = excluded.amount,
             movement_date = excluded.movement_date,
             category      = excluded.category,
             description   = excluded.description;
      return;
    end if;
  end if;

  -- Artık kasaya düşmemeli (yöntem değişti, kaynak silindi/iptal edildi, kasa yok…)
  delete from public.cash_movements where ref_type = p_ref_type and ref_id = p_ref_id;
end $$;

create or replace function public._trg_cash_sync_expense()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  begin
    perform public._cash_sync('expense', v_id);
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (expense %): %', v_id, sqlerrm;
  end;
  return null;
end $$;

create or replace function public.cash_unposted_summary()
returns table (currency text, cnt integer, total numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select public.get_my_lab_id() as lab
     where public.has_permission('view_cash') or public.has_permission('manage_cash')
  ),
  first_open as (
    select min(a.opened_at) as t from public.cash_accounts a join me on a.lab_id = me.lab where a.is_drawer
  ),
  src as (
    select coalesce(p.currency, i.currency) as cur, p.amount as amt, p.created_at
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      join me on coalesce(p.lab_id, i.lab_id) = me.lab
     where p.payment_method = 'nakit' and p.receipt_id is null and i.status <> 'iptal'
    union all
    select l.currency, l.amount, l.created_at
      from public.clinic_receipt_lines l
      join public.clinic_receipts r on r.id = l.receipt_id
      join me on r.lab_id = me.lab
     where r.payment_method = 'nakit'
    union all
    select e.currency, -e.amount, e.created_at
      from public.expenses e
      join me on e.lab_id = me.lab
     where e.payment_method = 'nakit' and e.purchase_invoice_id is null and e.delivery_id is null
       and e.recurring_template_id is null
  )
  select s.cur, count(*)::integer, sum(s.amt)
    from src s
    cross join first_open f
   where f.t is not null
     and s.created_at > f.t
     and not exists (select 1 from public.cash_accounts a join me on a.lab_id = me.lab
                      where a.currency = s.cur and a.is_drawer and a.is_active)
   group by s.cur
   order by s.cur;
$$;
