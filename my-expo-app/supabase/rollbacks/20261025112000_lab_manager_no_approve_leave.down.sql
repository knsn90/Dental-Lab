-- GERİ ALMA: 20261025112000_lab_manager_no_approve_leave.sql — lab müdürünün approve_leave varsayılanını geri ekler.
insert into public.role_permissions (role_key, permission_key, lab_id)
select 'lab_manager', 'approve_leave', null
where not exists (select 1 from public.role_permissions where role_key = 'lab_manager' and lab_id is null and permission_key = 'approve_leave');
