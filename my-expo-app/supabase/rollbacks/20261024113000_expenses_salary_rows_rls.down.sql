-- GERİ ALMA: 20261024113000_expenses_salary_rows_rls.sql (kaynak: 20261024-hr-rls.before.txt)
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));
