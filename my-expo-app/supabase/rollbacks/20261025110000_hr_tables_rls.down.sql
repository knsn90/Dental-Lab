-- GERİ ALMA: 20261025110000_hr_tables_rls.sql — 2026-10-25 canlı kuralları (supabase/rollbacks/20261025-0b.before.txt).

drop policy if exists el_read on public.employee_leaves;
drop policy if exists el_insert on public.employee_leaves;
drop policy if exists el_update on public.employee_leaves;
drop policy if exists el_delete on public.employee_leaves;
drop policy if exists ea_read on public.employee_attendance;
drop policy if exists ea_write on public.employee_attendance;
drop policy if exists ed_read on public.employee_documents;
drop policy if exists ed_write on public.employee_documents;
drop policy if exists ep_read on public.employee_performance;
drop policy if exists ep_write on public.employee_performance;
drop policy if exists employee_docs_read on storage.objects;
drop policy if exists employee_docs_upload on storage.objects;
drop policy if exists employee_docs_delete on storage.objects;

create policy emp_perf_lab_own on public.employee_performance as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
create policy employee_docs_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'employee-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (labs.id)::text AS id
   FROM labs
  WHERE (labs.id = get_my_lab_id())
 LIMIT 1))));
create policy employee_docs_read on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'employee-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (labs.id)::text AS id
   FROM labs
  WHERE (labs.id = get_my_lab_id())
 LIMIT 1))));
create policy employee_docs_upload on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'employee-docs'::text) AND ((storage.foldername(name))[1] = ( SELECT (labs.id)::text AS id
   FROM labs
  WHERE (labs.id = get_my_lab_id())
 LIMIT 1))));
create policy employee_attendance_lab_own on public.employee_attendance as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
create policy emp_docs_lab_own on public.employee_documents as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
create policy employee_leaves_lab_own on public.employee_leaves as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
