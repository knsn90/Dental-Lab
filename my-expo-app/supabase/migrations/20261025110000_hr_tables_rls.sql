-- İK tabloları erişim kuralları — 0b Görev 1 (spec: docs/superpowers/specs/2026-10-25-ik-tablolari-erisim-design.md).
-- "Lab içi herkes her şey" (FOR ALL lab_id = get_my_lab_id()) kuralları yetki + kendi kaydı ile değişir.
-- own = employee_id = my_employee_id() (giriş e-postası = personel kartı e-postası).
--   employee_leaves     okuma: own / view_leaves / manage_leaves / approve_leave
--                       onay-ret YALNIZ approve_leave; manage_leaves ve own yalnız 'bekliyor'/'iptal' kayıtlarda
--                       (own ayrıca yalnız kendi adına); kendi iznini onaylamak kapanır.
--   employee_attendance okuma: own / view_attendance_all / manage_attendance; yazma: manage_attendance
--                       (QR girişi qr_checkin SECURITY DEFINER üzerinden — etkilenmez)
--   employee_documents  okuma: own / view_employee_documents / manage_employee_documents; yazma: manage_employee_documents
--   employee_performance okuma: own / view_performance; yazma: can_write_payroll() (hesap fonksiyonları DEFINER)
--   depo employee-docs ({lab}/{employee}/…) okuma: kendi klasörü / belge yetkisi; yükleme-silme: manage_employee_documents
-- Geri alma: supabase/rollbacks/20261025110000_hr_tables_rls.down.sql

-- ── employee_leaves ───────────────────────────────────────────────────────
drop policy if exists employee_leaves_lab_own on public.employee_leaves;

create policy el_read on public.employee_leaves for select
  using (lab_id = (select public.get_my_lab_id())
         and (employee_id = (select public.my_employee_id())
              or (select public.has_permission('view_leaves'))
              or (select public.has_permission('manage_leaves'))
              or (select public.has_permission('approve_leave'))));

create policy el_insert on public.employee_leaves for insert
  with check (lab_id = (select public.get_my_lab_id())
              and ((select public.has_permission('approve_leave'))
                   or (status = 'bekliyor'
                       and ((select public.has_permission('manage_leaves'))
                            or employee_id = (select public.my_employee_id())))));

create policy el_update on public.employee_leaves for update
  using (lab_id = (select public.get_my_lab_id())
         and ((select public.has_permission('approve_leave'))
              or (status in ('bekliyor', 'iptal')
                  and ((select public.has_permission('manage_leaves'))
                       or employee_id = (select public.my_employee_id())))))
  with check (lab_id = (select public.get_my_lab_id())
              and ((select public.has_permission('approve_leave'))
                   or (status in ('bekliyor', 'iptal')
                       and ((select public.has_permission('manage_leaves'))
                            or employee_id = (select public.my_employee_id())))));

create policy el_delete on public.employee_leaves for delete
  using (lab_id = (select public.get_my_lab_id())
         and ((select public.has_permission('approve_leave'))
              or (status in ('bekliyor', 'iptal') and (select public.has_permission('manage_leaves')))));

-- ── employee_attendance ───────────────────────────────────────────────────
drop policy if exists employee_attendance_lab_own on public.employee_attendance;

create policy ea_read on public.employee_attendance for select
  using (lab_id = (select public.get_my_lab_id())
         and (employee_id = (select public.my_employee_id())
              or (select public.has_permission('view_attendance_all'))
              or (select public.has_permission('manage_attendance'))));

create policy ea_write on public.employee_attendance for all
  using (lab_id = (select public.get_my_lab_id()) and (select public.has_permission('manage_attendance')))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.has_permission('manage_attendance')));

-- ── employee_documents ────────────────────────────────────────────────────
drop policy if exists emp_docs_lab_own on public.employee_documents;

create policy ed_read on public.employee_documents for select
  using (lab_id = (select public.get_my_lab_id())
         and (employee_id = (select public.my_employee_id())
              or (select public.has_permission('view_employee_documents'))
              or (select public.has_permission('manage_employee_documents'))));

create policy ed_write on public.employee_documents for all
  using (lab_id = (select public.get_my_lab_id()) and (select public.has_permission('manage_employee_documents')))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.has_permission('manage_employee_documents')));

-- ── employee_performance ──────────────────────────────────────────────────
drop policy if exists emp_perf_lab_own on public.employee_performance;

create policy ep_read on public.employee_performance for select
  using (lab_id = (select public.get_my_lab_id())
         and (employee_id = (select public.my_employee_id())
              or (select public.has_permission('view_performance'))));

create policy ep_write on public.employee_performance for all
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

-- ── depo: employee-docs ({lab}/{employee}/{dosya}) ────────────────────────
drop policy if exists employee_docs_read on storage.objects;
drop policy if exists employee_docs_upload on storage.objects;
drop policy if exists employee_docs_delete on storage.objects;

create policy employee_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs'
         and (storage.foldername(name))[1] = (select public.get_my_lab_id())::text
         and ((storage.foldername(name))[2] = (select public.my_employee_id())::text
              or (select public.has_permission('view_employee_documents'))
              or (select public.has_permission('manage_employee_documents'))));

create policy employee_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs'
              and (storage.foldername(name))[1] = (select public.get_my_lab_id())::text
              and (select public.has_permission('manage_employee_documents')));

create policy employee_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs'
         and (storage.foldername(name))[1] = (select public.get_my_lab_id())::text
         and (select public.has_permission('manage_employee_documents')));
