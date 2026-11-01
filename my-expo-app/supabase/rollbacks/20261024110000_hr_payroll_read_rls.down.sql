-- GERİ ALMA: 20261024110000_hr_payroll_read_rls.sql
-- 5 SELECT kuralını değişiklik öncesi ifadelerine döndürür (kaynak: 20261024-hr-rls.before.txt).
-- my_employee_id() Görev 2 ve 3 tarafından da kullanılır: o migration'lar uygulandıysa
-- önce ONLARIN geri alma betiklerini çalıştır, sonra bunu.

drop policy if exists salary_payments_read on public.salary_payments;
create policy salary_payments_read on public.salary_payments for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));

drop policy if exists employee_advances_read on public.employee_advances;
create policy employee_advances_read on public.employee_advances for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));

drop policy if exists employee_payroll_read on public.employee_payroll;
create policy employee_payroll_read on public.employee_payroll for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));

drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));

drop policy if exists performance_bonuses_read on public.performance_bonuses;
create policy performance_bonuses_read on public.performance_bonuses for select
  using (is_platform_admin() or (lab_id = get_my_lab_id()));

drop function if exists public.can_view_payroll();
drop function if exists public.my_employee_id();
