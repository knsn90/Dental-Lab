-- 20261104100000_gider_okuma_finans_izni
-- Giderlerin okunması finans iznine bağlanır (yol haritası: 2. dalga açık kalanı,
-- "expenses tablosu lab genelinde okunabiliyor").
-- Durum: expenses_read yalnız "aynı lab" şartına bakıyordu; maaş/avans satırları dışındaki her
-- gider (kira, malzeme, kurye, vergi…) lab'daki teknisyen ve kuryeye de açıktı. Ekranda Giderler
-- zaten view_financials istiyor; veritabanı aynı çizgiye çekilir.
--   • Maaş/avans DIŞI satırlar: lab_can_view_finance() (lab/admin + view_financials | view_finance
--     | manage_finance; platform yöneticisi).
--   • Maaş/avans satırları: değişmez — can_view_payroll().
--   • v_budget_actuals, v_monthly_finance_summary(_ccy) security_invoker; aynı kurala uyar.
-- Canlıda finans/bordro izni yalnız "admin" rolünde → bugün Giderler'i kullanan kimse etkilenmez.
-- Tek ALTER POLICY: kuralın boş kaldığı bir an olmaz.
-- Geri alma: rollbacks/20261104100000_gider_okuma_finans_izni.down.sql

ALTER POLICY expenses_read ON public.expenses
  USING (
    is_platform_admin()
    OR (lab_id = get_my_lab_id() AND (
         (salary_payment_id IS NULL AND advance_id IS NULL AND (SELECT lab_can_view_finance()))
      OR ((salary_payment_id IS NOT NULL OR advance_id IS NOT NULL) AND (SELECT can_view_payroll()))
    ))
  );
