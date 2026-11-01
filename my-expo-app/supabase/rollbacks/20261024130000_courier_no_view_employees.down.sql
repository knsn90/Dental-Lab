-- GERİ ALMA: 20261024130000_courier_no_view_employees.sql — kuryenin iki varsayılan yetkisini geri ekler.
insert into public.role_permissions (role_key, permission_key, lab_id)
select 'courier', k, null from (values ('view_employees'), ('view_team')) v(k)
where not exists (select 1 from public.role_permissions rp where rp.role_key = 'courier' and rp.lab_id is null and rp.permission_key = v.k);
