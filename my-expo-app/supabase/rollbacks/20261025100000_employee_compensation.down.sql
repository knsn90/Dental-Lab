-- GERİ ALMA: 20261025100000_employee_compensation.sql
-- Tetikleyicileri ve fonksiyonlarını kaldırır, profildeki maaşları 2026-10-25 öncesi değerlerine
-- döndürür (tam kopya: supabase/rollbacks/20261025-maas.before.txt), tabloyu ve can_write_payroll'u siler.
-- SIRA: önce 20261025103000 → 102000 → 101000 geri alınır, sonra bu dosya (görünüm/fonksiyon bağımlılığı).
-- Maaş/TC değerleri yeni tabloda yaşıyor (yayından sonra yapılan düzenlemeler dahil): tablo silinmeden
-- ÖNCE personel kartına geri kopyalanır (son inceleme, 2026-10-25).

drop trigger if exists trg_employees_comp_sync on public.employees;
drop trigger if exists trg_employees_comp_guard on public.employees;
drop trigger if exists trg_profiles_monthly_salary_null on public.profiles;
drop function if exists public.employees_comp_sync();
drop function if exists public.employees_comp_guard();
drop function if exists public.profiles_monthly_salary_null();

update public.employees e
   set base_salary = coalesce(c.base_salary, e.base_salary),
       tc_no       = coalesce(c.tc_no, e.tc_no)
  from public.employee_compensation c
 where c.employee_id = e.id;

update public.profiles p set monthly_salary = v.s
  from (values
    ('5ab98f51-dbef-4916-aa61-76a82bbdf219'::uuid, 35000),
    ('8ce19a0e-445d-4167-87e6-9fc192875169'::uuid, 0),
    ('36cf5470-a9e1-4d67-b9a6-adadbbf3b50f'::uuid, 40000),
    ('d72d7f0c-6922-4317-8dfd-906a1b50556a'::uuid, 60000),
    ('8cde8a36-e391-4de4-9672-98dae3051810'::uuid, 0)
  ) v(id, s)
 where p.id = v.id;

drop table if exists public.employee_compensation;
drop function if exists public.can_write_payroll();
