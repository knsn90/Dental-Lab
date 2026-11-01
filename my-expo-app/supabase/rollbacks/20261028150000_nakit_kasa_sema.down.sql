-- Geri alma: 20261028150000_nakit_kasa_sema.sql → canlı ÖNCE hâli (bkz. .before.txt)
-- Not: transfer/sayim kategorili hareket varsa eski CHECK kurulamaz; önce onlar silinmelidir.

drop trigger if exists trg_expense_recurring_mark on public.expenses;
drop function if exists public._expense_recurring_mark();
alter table public.expenses drop column if exists recurring_template_id;

drop policy if exists cash_movements_read on public.cash_movements;
drop policy if exists cash_movements_insert on public.cash_movements;
drop policy if exists cash_movements_update on public.cash_movements;
drop policy if exists cash_movements_delete on public.cash_movements;
drop policy if exists cash_accounts_read on public.cash_accounts;
drop policy if exists cash_accounts_insert on public.cash_accounts;
drop policy if exists cash_accounts_update on public.cash_accounts;
drop policy if exists cash_accounts_delete on public.cash_accounts;

create policy cash_accounts_lab_own on public.cash_accounts
  using (lab_id = get_my_lab_id()) with check (lab_id = get_my_lab_id());
create policy cash_movements_lab_own on public.cash_movements
  using (lab_id = get_my_lab_id()) with check (lab_id = get_my_lab_id());

drop table if exists public.cash_counts;

drop index if exists public.ux_cash_movement_ref;
alter table public.cash_movements drop constraint cash_movements_category_check;
alter table public.cash_movements add constraint cash_movements_category_check
  check (category = any (array['tahsilat','odeme','maas','kira','malzeme','vergi','diger']));

drop index if exists public.ux_cash_drawer;
alter table public.cash_accounts drop column if exists opened_at;
alter table public.cash_accounts drop column if exists is_drawer;

alter table public.cash_movements drop constraint if exists cash_movements_lab_id_fkey;
alter table public.cash_accounts drop constraint if exists cash_accounts_lab_id_fkey;
