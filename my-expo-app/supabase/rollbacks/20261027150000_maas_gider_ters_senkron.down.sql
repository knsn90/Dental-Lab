-- Geri alma: 20261027150000_maas_gider_ters_senkron
drop trigger if exists trg_expense_to_salary on public.expenses;
drop function if exists public.sync_expense_to_salary();
-- Tek seferlik düzeltmenin geri alınışı: maaş kaydının eski tarihi (gider 2026-06-04'te kalır).
-- Maaş→gider tetikleyicisi gideri de değiştirmesin diye geçici olarak kapatılır.
alter table public.salary_payments disable trigger trg_salary_to_expense;
update public.salary_payments set payment_date = date '2026-10-04' where id = 'a231a551-90a7-40eb-aa96-b25b737eab8d';
alter table public.salary_payments enable trigger trg_salary_to_expense;
