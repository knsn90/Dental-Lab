-- Gider tablosundaki MAAŞ ve AVANS satırlarının okuma kuralı (denetim K1 ek — bağımsız inceleme C1, 2026-10-24).
--
-- Sorun: maaş ödemeleri ve avanslar tetikleyicilerle (sync_salary_to_expense / sync_advance_to_expense)
-- expenses'e "Maaş ödemesi: <personel adı> · AA/YYYY" açıklamasıyla kopyalanıyor; expenses_read
-- lab-geneli olduğu için teknisyen 11/11 maaş giderini görüyordu (canlıda doğrulandı) —
-- 20261024110000'de kapatılan salary_payments kuralının arka kapısı.
--
-- Yeni kural: salary_payment_id ya da advance_id DOLU satırları yalnız maaş yetkisi olan
-- (can_view_payroll) görür; diğer giderler eskisi gibi (lab içi). Yazma kuralları değişmedi.
-- Gider ekranları yalnız finans yetkisiyle açılıyor (admin) → ekranda görünür değişiklik yok.
-- Geri alma: supabase/rollbacks/20261024113000_expenses_salary_rows_rls.down.sql

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select
  using (is_platform_admin() or (lab_id = get_my_lab_id() and (
    (salary_payment_id is null and advance_id is null) or (select can_view_payroll())
  )));
