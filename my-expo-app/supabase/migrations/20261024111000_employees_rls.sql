-- Personel (employees) satır kuralları (lab yöneticisi denetimi K1, 2026-10-24).
--
-- Sorun: tek "employees_lab_own" kuralı (FOR ALL, yalnız "aynı lab") okuma+yazma+silmeyi
-- lab'daki herkese açıyordu. Canlıda doğrulandı: teknisyen 7/7 personeli (temel maaş dahil)
-- görüyor ve müdürün personel kaydını güncelleyebiliyordu.
--
-- Yeni kurallar:
--   okuma : personeli görme ya da yönetme yetkisi olan + herkes KENDİ kaydını
--           (manage_employees SELECT'e de eklendi: insert().select() INSERT ⊇ SELECT ister)
--   yazma : yalnız personeli yönetme yetkisi olan (manage_employees)
-- Not: personel listesini görme yetkisi olan roller (lab müdürü, kurye) temel maaş sütununu
-- hâlâ görür; maaşın ayrı tabloya/RPC'ye taşınması yol haritası 2. dalga 10. madde.
-- Platform yöneticisi istisnası EKLENMEDİ: eski kural da yalnız lab içiydi; eklenirse
-- platform yöneticisinin Ekip ekranında (v_employee_summary, security_invoker) diğer lab'ların
-- personeli görünür (denemede 7 → 8 çıktı).
-- Bağımlılık: my_employee_id() — 20261024110000_hr_payroll_read_rls.sql
-- Geri alma: supabase/rollbacks/20261024111000_employees_rls.down.sql

drop policy if exists employees_lab_own on public.employees;

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select
  using ((lab_id = get_my_lab_id() and (
    has_permission('view_employees') or has_permission('manage_employees') or id = my_employee_id()
  )));

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert
  with check ((lab_id = get_my_lab_id() and has_permission('manage_employees')));

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update
  using ((lab_id = get_my_lab_id() and has_permission('manage_employees')))
  with check ((lab_id = get_my_lab_id() and has_permission('manage_employees')));

drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete
  using ((lab_id = get_my_lab_id() and has_permission('manage_employees')));
