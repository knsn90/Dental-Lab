-- Kurye rolü personel listesini görmez (denetim yol haritası "karar bekleyenler", kullanıcı kararı 2026-10-24).
--
-- Kurye varsayılan yetkilerinde view_employees (employees_read RLS kuralını açar) ve onun eski adı
-- view_team (istemcide view_employees'e eşlenir) vardı → kurye tüm personel kartlarını (iletişim,
-- e-posta, maaş alanı dahil) okuyabiliyordu. Kurye panelinde personel ekranı yok; kullanım yok.
-- Kendi personel kaydı my_employee_id() ile görünmeye devam eder (employees_read kuralı).
-- Kurye için lab'a özel yetki seti (lab_role_permission_overrides) yok — yalnız ortak varsayılan değişir.
-- Geri alma: supabase/rollbacks/20261024130000_courier_no_view_employees.down.sql

delete from public.role_permissions
 where role_key = 'courier'
   and lab_id is null
   and permission_key in ('view_employees', 'view_team');
