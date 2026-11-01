-- 20261101121000_karlilik_kirilim GERİ ALMA — üç fonksiyon migration'dan önce yoktu (2026-11-01).
DROP FUNCTION IF EXISTS public.profitability_by_service(uuid, date, date);
DROP FUNCTION IF EXISTS public.profitability_by_clinic(uuid, date, date);
DROP FUNCTION IF EXISTS public._profit_revenue_lines(uuid, date, date);
