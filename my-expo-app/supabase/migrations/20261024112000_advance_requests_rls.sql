-- Avans talepleri (employee_advance_requests) kuralları (lab yöneticisi denetimi K1, 2026-10-24).
--
-- Sorun: tek "ear_lab_own" kuralı (FOR ALL, yalnız "aynı lab"). Canlıda doğrulandı: bir personel
-- başkasının taleplerini görüyor, başkası adına talep açabiliyor, başkasının talebini
-- değiştirebiliyor ve KENDİ talebini kendisi onaylayabiliyordu.
--
-- Yeni kurallar (akış: modules/advance-requests/api.ts):
--   okuma   : maaş yetkisi olan (can_view_payroll) hepsini; personel yalnız kendi taleplerini
--   açma    : personel yalnız kendi adına ve yalnız 'bekliyor' durumunda; maaş/finans yöneticisi herkes adına
--   değiştir: maaş/finans yöneticisi (onay/ret); personel yalnız kendi 'bekliyor' talebini 'iptal'e çekebilir
--             (WITH CHECK 'iptal'e izin verir — yoksa iptal düğmesi çalışmazdı; 'onaylandi'ya izin vermez)
--   silme   : yalnız maaş/finans yöneticisi (arayüzde silme yok; iptal güncellemeyle yapılıyor)
-- Platform yöneticisi istisnası eklenmedi (eski kural da yalnız lab içiydi).
-- Bağımlılık: my_employee_id(), can_view_payroll() — 20261024110000_hr_payroll_read_rls.sql
-- Geri alma: supabase/rollbacks/20261024112000_advance_requests_rls.down.sql

drop policy if exists ear_lab_own on public.employee_advance_requests;

drop policy if exists ear_read on public.employee_advance_requests;
create policy ear_read on public.employee_advance_requests for select
  using (lab_id = get_my_lab_id() and (can_view_payroll() or employee_id = my_employee_id()));

drop policy if exists ear_insert on public.employee_advance_requests;
create policy ear_insert on public.employee_advance_requests for insert
  with check (lab_id = get_my_lab_id() and (
    has_permission('manage_salaries') or has_permission('manage_finance')
    or (employee_id = my_employee_id() and status = 'bekliyor')
  ));

drop policy if exists ear_update on public.employee_advance_requests;
create policy ear_update on public.employee_advance_requests for update
  using (lab_id = get_my_lab_id() and (
    has_permission('manage_salaries') or has_permission('manage_finance')
    or (employee_id = my_employee_id() and status = 'bekliyor')
  ))
  with check (lab_id = get_my_lab_id() and (
    has_permission('manage_salaries') or has_permission('manage_finance')
    or (employee_id = my_employee_id() and status in ('bekliyor', 'iptal'))
  ));

drop policy if exists ear_delete on public.employee_advance_requests;
create policy ear_delete on public.employee_advance_requests for delete
  using (lab_id = get_my_lab_id() and (has_permission('manage_salaries') or has_permission('manage_finance')));
