-- Maaş, bordro, avans ve prim tablolarının OKUMA kuralları (lab yöneticisi denetimi K1, 2026-10-24).
--
-- Sorun: bu 5 tablonun SELECT kuralı yalnız "aynı lab" arıyordu. Teknisyen ya da kurye,
-- API'den lab'daki herkesin maaş ödemelerini okuyabiliyordu (canlıda doğrulandı:
-- teknisyen 11/11 maaş ödemesini görüyordu).
--
-- Yeni kural: maaş yetkisi olan (view_salaries / manage_salaries / manage_finance ya da
-- platform admin) hepsini görür; diğerleri yalnız KENDİ personel kaydına ait satırları.
-- Yazma kuralları DEĞİŞMEDİ (zaten manage_finance'e bağlı).
-- Ekranlar maaş/avansı zaten yalnız view_salaries ile gösteriyor; HR görünümleri
-- (v_employee_summary vb.) security_invoker olduğu için bu kurallar onlara da uygulanır.
--
-- Geri alma: supabase/rollbacks/20261024110000_hr_payroll_read_rls.down.sql

-- Çağıranın aktif personel kaydı (core/api/resolveEmployee.ts ile aynı kural:
-- önce e-posta eşleşmesi, yoksa aynı lab'da TEK tam-ad eşleşmesi). Yoksa NULL.
create or replace function public.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.profiles p on p.id = auth.uid()
  where e.lab_id = p.lab_id and e.is_active
    and (
      (nullif(lower(btrim(e.email)), '') is not null
        and lower(btrim(e.email)) = lower(btrim(p.email)))
      or (
        lower(btrim(e.full_name)) = lower(btrim(p.full_name))
        and not exists (select 1 from public.employees e2
                        where e2.lab_id = p.lab_id and e2.is_active and e2.id <> e.id
                          and lower(btrim(e2.full_name)) = lower(btrim(p.full_name)))
      )
    )
  order by (lower(btrim(e.email)) = lower(btrim(p.email))) desc nulls last
  limit 1;
$$;

-- Maaş/bordro verisini topluca görebilir mi?
create or replace function public.can_view_payroll()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin()
      or has_permission('view_salaries')
      or has_permission('manage_salaries')
      or has_permission('manage_finance');
$$;

revoke all on function public.my_employee_id() from public, anon;
revoke all on function public.can_view_payroll() from public, anon;
grant execute on function public.my_employee_id() to authenticated;
grant execute on function public.can_view_payroll() to authenticated;

drop policy if exists salary_payments_read on public.salary_payments;
create policy salary_payments_read on public.salary_payments for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id())));

drop policy if exists employee_advances_read on public.employee_advances;
create policy employee_advances_read on public.employee_advances for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id())));

drop policy if exists employee_payroll_read on public.employee_payroll;
create policy employee_payroll_read on public.employee_payroll for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id())));

drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll()
    or payroll_id in (select id from public.employee_payroll where employee_id = my_employee_id()))));

drop policy if exists performance_bonuses_read on public.performance_bonuses;
create policy performance_bonuses_read on public.performance_bonuses for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (can_view_payroll()
    or payroll_id in (select id from public.employee_payroll where employee_id = my_employee_id()))));
