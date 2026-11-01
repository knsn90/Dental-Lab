-- Nakit kasa (denetim yol haritası 2. dalga madde 8) · Görev 3: açılış, sayım, kasası olmayan nakit.
-- Spec: docs/superpowers/specs/2026-10-28-nakit-kasa-design.md §4.1, §4.3 · Geri alma: supabase/rollbacks/20261028152000_nakit_kasa_rpc.down.sql
-- Bankaya yatırma RPC değildir: istemci cash_movements'a category='transfer', ref_type NULL ile yazar (manage_cash kuralı).

-- ─── Kasa açılışı: sayılan tutarla başlar, açılış anı = kesim anı ─────────────
create or replace function public.cash_open_drawer(p_currency text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lab uuid := public.get_my_lab_id();
  v_cur text := upper(trim(coalesce(p_currency, '')));
  v_id  uuid;
begin
  if v_lab is null or not public.has_permission('manage_cash') then
    raise exception 'Yetkiniz yok' using errcode = '42501';
  end if;
  if v_cur not in ('TRY', 'EUR') then
    raise exception 'Nakit kasa yalnız TRY veya EUR olabilir' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Tutar sıfır ya da pozitif olmalı' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_accounts
              where lab_id = v_lab and currency = v_cur and is_drawer and is_active) then
    raise exception 'Bu para biriminde kasa zaten açık' using errcode = '23505';
  end if;

  insert into public.cash_accounts (lab_id, name, account_type, currency, opening_balance, is_drawer, opened_at)
  values (v_lab, 'Nakit Kasa · ' || v_cur, 'kasa', v_cur, round(p_amount, 2), true, now())
  returning id into v_id;

  insert into public.cash_counts (lab_id, account_id, kind, counted_at, counted_amount, expected_amount, diff, created_by)
  values (v_lab, v_id, 'acilis', now(), round(p_amount, 2), null, 0, auth.uid());

  return v_id;
end $$;

-- ─── Sayım: sayılan − beklenen farkı "sayım farkı" hareketi olur ──────────────
create or replace function public.cash_count_drawer(p_account uuid, p_counted numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lab   uuid := public.get_my_lab_id();
  v_cnt   uuid := gen_random_uuid();
  v_exp   numeric;
  v_diff  numeric;
  v_mov   uuid;
begin
  if v_lab is null or not public.has_permission('manage_cash') then
    raise exception 'Yetkiniz yok' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Tutar sıfır ya da pozitif olmalı' using errcode = '22023';
  end if;
  perform 1 from public.cash_accounts
   where id = p_account and lab_id = v_lab and is_drawer and is_active
   for update;
  if not found then
    raise exception 'Kasa bulunamadı' using errcode = 'P0002';
  end if;

  select round(balance, 2) into v_exp from public.v_cash_account_summary where id = p_account;
  v_diff := round(p_counted, 2) - coalesce(v_exp, 0);

  if v_diff <> 0 then
    insert into public.cash_movements
           (lab_id, account_id, direction, amount, movement_date, category, description, ref_type, ref_id, created_by)
    values (v_lab, p_account, case when v_diff > 0 then 'giris' else 'cikis' end, abs(v_diff), current_date,
            'sayim', 'Sayım farkı · ' || to_char(current_date, 'DD.MM.YYYY'), 'cash_count', v_cnt, auth.uid())
    returning id into v_mov;
  end if;

  insert into public.cash_counts
         (id, lab_id, account_id, kind, counted_at, counted_amount, expected_amount, diff, movement_id, created_by)
  values (v_cnt, v_lab, p_account, 'sayim', now(), round(p_counted, 2), coalesce(v_exp, 0), v_diff, v_mov, auth.uid());

  return jsonb_build_object('count_id', v_cnt, 'expected', coalesce(v_exp, 0), 'diff', v_diff, 'movement_id', v_mov);
end $$;

-- ─── Kasası olmayan nakit: kasaya düşmesi gereken ama çekmecesi olmayan para birimi ─
-- İlk çekmece açılışından sonra oluşturulmuş, _cash_sync kuralına uyan kayıtlar; total = net (giriş − çıkış).
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

revoke all on function public.cash_open_drawer(text, numeric) from public, anon;
revoke all on function public.cash_count_drawer(uuid, numeric) from public, anon;
revoke all on function public.cash_unposted_summary() from public, anon;
grant execute on function public.cash_open_drawer(text, numeric) to authenticated;
grant execute on function public.cash_count_drawer(uuid, numeric) to authenticated;
grant execute on function public.cash_unposted_summary() to authenticated;
