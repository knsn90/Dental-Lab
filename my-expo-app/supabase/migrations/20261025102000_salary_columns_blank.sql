-- Maaş tek kaynak — C (plan Görev 6). Ekran tarafı (employee_compensation okuyan istemci) yayında.
-- Personel kartındaki eski maaş/TC sütunları BOŞALTILIR, SİLİNMEZ: telefonlara yüklü eski bir
-- uygulama ya da servis çalışanının sunduğu eski paket bu sütunları sorgularsa çökmesin, boş görsün.
--   * employees.base_salary / tc_no → NULL (değerler employee_compensation'da; 20261025100000).
--   * trg_employees_comp_zblank (AFTER, aktar=trg_employees_comp_sync'ten SONRA): eski istemci bir
--     değer yazarsa sync onu (yetkiliyse) yeni tabloya taşır, bu tetikleyici sütunu yeniden boşaltır.
--   * v_user_salary_summary kaldırılır: istemcide kullanılmıyordu, profiles.monthly_salary'yi okuyordu.
-- Sütunların fiziksel silinmesi ayrı, sonraki temizlik işi (eski istemci kalmadığında).
-- Geri alma: supabase/rollbacks/20261025102000_salary_columns_blank.down.sql

-- base_salary NOT NULL DEFAULT 0 idi: boşaltmak için kural kalkar; varsayılan da kalkar (yeni personel
-- kaydı maaşı 0 olarak yazıp aktarma tetikleyicisiyle employee_compensation'a 0 taşımasın).
alter table public.employees alter column base_salary drop not null;
alter table public.employees alter column base_salary drop default;

update public.employees set base_salary = null, tc_no = null
 where base_salary is not null or tc_no is not null;

create or replace function public.employees_comp_blank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_salary is not null or new.tc_no is not null then
    update public.employees set base_salary = null, tc_no = null where id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists trg_employees_comp_zblank on public.employees;
create trigger trg_employees_comp_zblank
  after insert or update on public.employees
  for each row execute function public.employees_comp_blank();

drop view if exists public.v_user_salary_summary;
