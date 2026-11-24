-- GERİ ALMA: 20261124061459_rapor_kesinlesmemis_gelir
-- CREATE OR REPLACE VIEW sütun SİLEMEZ → view'ları düşürüp 20261124060512 tanımıyla yeniden kur.
-- Kullanan tek yer FinanceReportScreen (DB bağımlılığı yok, 2026-11-24 doğrulandı).
BEGIN;
DROP VIEW public.v_monthly_finance_summary;
DROP VIEW public.v_monthly_finance_summary_ccy;
\i ../migrations/20261124060512_rapor_gelir_kdv_haric.sql
GRANT SELECT ON public.v_monthly_finance_summary, public.v_monthly_finance_summary_ccy TO authenticated;
DROP FUNCTION public._draft_is_unbilled(uuid, uuid);
COMMIT;
