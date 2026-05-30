-- Rollback: 20260530_performance_indexes.sql
-- Çalıştırmadan önce: Bu işlem geri alınamaz, veriler korunur ama index/fonksiyon silinir.

DROP FUNCTION IF EXISTS get_dashboard_stats();

DROP INDEX IF EXISTS idx_work_orders_lab_status_date;
DROP INDEX IF EXISTS idx_provas_lab_date_status;
