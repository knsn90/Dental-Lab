-- GERİ ALMA: 20261024111000_employees_rls.sql
-- 4 yeni kuralı düşürür, değişiklik öncesi tek kuralı birebir geri kurar
-- (kaynak: 20261024-hr-rls.before.txt).

drop policy if exists employees_read on public.employees;
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;

drop policy if exists employees_lab_own on public.employees;
create policy employees_lab_own on public.employees for all
  using (lab_id = get_my_lab_id())
  with check (lab_id = get_my_lab_id());
