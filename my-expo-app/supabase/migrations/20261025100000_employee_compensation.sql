-- Maaş tek kaynak — A1 (spec: docs/superpowers/specs/2026-10-25-maas-tek-kaynak-design.md, plan Görev 1).
--
-- Maaş ve TC kimlik no, yalnız maaş yetkisinin (can_view_payroll) ve kişinin kendisinin
-- okuyabildiği employee_compensation tablosunda toplanır. Bu adım EKLEMELİDİR: eski sütunlar
-- (employees.base_salary / tc_no) durur, eski istemci çalışmaya devam eder.
--   * Geri doldurma: base_salary / tc_no'su NULL olmayan her personel (0 dahil — bordro NULL ile
--     0'ı farklı hesaplar, birebir korunur). Profil maaşı yalnız kart maaşı yoksa + giriş e-postası
--     eşleşiyorsa (bugün 0 kayıt). Kullanıcı kararı: uyuşmazlıkta personel kartı esas.
--   * Lab dışı sızıntı burada kapanır: profiles.monthly_salary boşaltılır ve hep boş tutulur
--     (hiçbir hesap kullanmıyor; bağlı klinik yöneticileri okuyabiliyordu).
--   * employees üzerinde iki tetikleyici:
--       koru  (BEFORE) — maaş yazma yetkisi olmayan istemci maaş/TC sütunlarını değiştiremez
--                        (eski Ekip formu maaş görünmeyince 0 gönderiyordu).
--       aktar (AFTER)  — yetkili değişiklik employee_compensation'a taşınır.
-- Geri alma: supabase/rollbacks/20261025100000_employee_compensation.down.sql

create or replace function public.can_write_payroll()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or public.has_permission('manage_salaries')
      or public.has_permission('manage_finance');
$$;

create table if not exists public.employee_compensation (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  lab_id      uuid not null references public.labs(id),
  base_salary numeric,
  tc_no       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists employee_compensation_lab_idx on public.employee_compensation(lab_id);

alter table public.employee_compensation enable row level security;
revoke all on public.employee_compensation from anon;

drop policy if exists ec_read on public.employee_compensation;
create policy ec_read on public.employee_compensation for select
  using (lab_id = (select public.get_my_lab_id())
         and ((select public.can_view_payroll()) or employee_id = (select public.my_employee_id())));

drop policy if exists ec_insert on public.employee_compensation;
create policy ec_insert on public.employee_compensation for insert
  with check (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

drop policy if exists ec_update on public.employee_compensation;
create policy ec_update on public.employee_compensation for update
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

drop policy if exists ec_delete on public.employee_compensation;
create policy ec_delete on public.employee_compensation for delete
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

-- Geri doldurma
insert into public.employee_compensation (employee_id, lab_id, base_salary, tc_no)
select e.id, e.lab_id, e.base_salary, nullif(btrim(e.tc_no), '')
  from public.employees e
 where e.lab_id is not null
   and (e.base_salary is not null or nullif(btrim(e.tc_no), '') is not null)
on conflict (employee_id) do nothing;

-- Kart maaşı yoksa, giriş e-postası eşleşen profilin maaşı (bugün 0 kayıt)
insert into public.employee_compensation (employee_id, lab_id, base_salary)
select e.id, e.lab_id, p.monthly_salary
  from public.employees e
  join auth.users u on lower(btrim(u.email)) = lower(btrim(e.email))
  join public.profiles p on p.id = u.id and p.lab_id = e.lab_id
 where e.lab_id is not null and e.base_salary is null
   and nullif(btrim(e.email), '') is not null
   and coalesce(p.monthly_salary, 0) <> 0
on conflict (employee_id) do update
  set base_salary = excluded.base_salary
  where public.employee_compensation.base_salary is null;

-- Lab dışı sızıntıyı kapat: profildeki maaş boşaltılır ve hep boş kalır
update public.profiles set monthly_salary = null where monthly_salary is not null;

create or replace function public.profiles_monthly_salary_null()
returns trigger
language plpgsql
as $$
begin
  new.monthly_salary := null;   -- maaş employee_compensation'da (20261025100000)
  return new;
end $$;

drop trigger if exists trg_profiles_monthly_salary_null on public.profiles;
create trigger trg_profiles_monthly_salary_null
  before insert or update on public.profiles
  for each row execute function public.profiles_monthly_salary_null();

-- employees: koru (BEFORE) — yetkisiz istemci maaş/TC sütunlarını değiştiremez
create or replace function public.employees_comp_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.can_write_payroll() then
    if tg_op = 'UPDATE' then
      new.base_salary := old.base_salary;
      new.tc_no       := old.tc_no;
    else
      new.base_salary := null;
      new.tc_no       := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_comp_guard on public.employees;
create trigger trg_employees_comp_guard
  before insert or update on public.employees
  for each row execute function public.employees_comp_guard();

-- employees: aktar (AFTER) — yetkili değişiklik employee_compensation'a
create or replace function public.employees_comp_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sal_changed boolean;
  v_tc_changed  boolean;
begin
  if new.lab_id is null then return null; end if;
  if auth.uid() is not null and not public.can_write_payroll() then return null; end if;

  v_sal_changed := new.base_salary is not null
                   and (tg_op = 'INSERT' or new.base_salary is distinct from old.base_salary);
  v_tc_changed  := nullif(btrim(new.tc_no), '') is not null
                   and (tg_op = 'INSERT' or new.tc_no is distinct from old.tc_no);
  if not (v_sal_changed or v_tc_changed) then return null; end if;

  insert into public.employee_compensation as ec (employee_id, lab_id, base_salary, tc_no, updated_at, updated_by)
  values (new.id, new.lab_id,
          case when v_sal_changed then new.base_salary end,
          case when v_tc_changed then nullif(btrim(new.tc_no), '') end,
          now(), auth.uid())
  on conflict (employee_id) do update
    set base_salary = case when v_sal_changed then excluded.base_salary else ec.base_salary end,
        tc_no       = case when v_tc_changed  then excluded.tc_no       else ec.tc_no       end,
        updated_at  = now(),
        updated_by  = auth.uid();
  return null;
end $$;

drop trigger if exists trg_employees_comp_sync on public.employees;
create trigger trg_employees_comp_sync
  after insert or update on public.employees
  for each row execute function public.employees_comp_sync();
