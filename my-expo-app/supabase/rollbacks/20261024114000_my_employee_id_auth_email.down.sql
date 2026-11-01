-- GERİ ALMA: 20261024114000_my_employee_id_auth_email.sql
-- my_employee_id()'yi 20261024110000'deki ilk sürümüne (profil e-postası + tek ad eşleşmesi) döndürür.
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
