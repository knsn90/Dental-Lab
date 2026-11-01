-- GERİ ALMA: 20261024112000_advance_requests_rls.sql
-- 4 yeni kuralı düşürür, değişiklik öncesi tek kuralı birebir geri kurar
-- (kaynak: 20261024-hr-rls.before.txt).

drop policy if exists ear_read on public.employee_advance_requests;
drop policy if exists ear_insert on public.employee_advance_requests;
drop policy if exists ear_update on public.employee_advance_requests;
drop policy if exists ear_delete on public.employee_advance_requests;

drop policy if exists ear_lab_own on public.employee_advance_requests;
create policy ear_lab_own on public.employee_advance_requests for all
  using (lab_id = get_my_lab_id())
  with check (lab_id = get_my_lab_id());
