-- Geri alma: 20261104100000_gider_okuma_finans_izni
-- Canlı önceki durum: rollbacks/20261104100000_gider_okuma_finans_izni.before.txt

ALTER POLICY expenses_read ON public.expenses
  USING (is_platform_admin() OR ((lab_id = get_my_lab_id()) AND (((salary_payment_id IS NULL) AND (advance_id IS NULL)) OR ( SELECT can_view_payroll() AS can_view_payroll))));
