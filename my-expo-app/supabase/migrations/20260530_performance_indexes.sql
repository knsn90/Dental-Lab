-- ============================================================
-- Migration: Performance — Composite Indexes + Dashboard RPC
-- ============================================================

-- ─── 1. Composite index: today/overdue sipariş sorguları ────────────────
-- fetchTodayAndOverdueOrders + dashboard status filter için
CREATE INDEX IF NOT EXISTS idx_work_orders_lab_status_date
  ON work_orders(lab_id, status, delivery_date);

-- ─── 2. Composite index: provas dashboard sorgusu ───────────────────────
CREATE INDEX IF NOT EXISTS idx_provas_lab_date_status
  ON provas(lab_id, return_date, status);

-- ─── 3. RPC: Dashboard istatistiklerini DB'de hesapla ───────────────────
-- RLS devrede (SECURITY INVOKER) → her kullanıcı kendi lab'ının verisini görür.
-- Önceki yaklaşım: tüm satırları JS'e çekip filter() — O(n) bellek.
-- Yeni yaklaşım: tek SQL sorgusu, sabit maliyet.
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH wo AS (
    SELECT
      COUNT(*) FILTER (WHERE status != 'teslim_edildi')                                   AS total_orders,
      COUNT(*) FILTER (WHERE status != 'teslim_edildi'
                         AND delivery_date < CURRENT_DATE)                                AS overdue_orders,
      COUNT(*) FILTER (WHERE status = 'teslimata_hazir')                                  AS ready_orders,
      COUNT(*) FILTER (WHERE status = 'uretimde')                                         AS in_progress_orders
    FROM work_orders
  ),
  pr AS (
    SELECT COUNT(*) AS today_provas
    FROM provas
    WHERE return_date = CURRENT_DATE
      AND status != 'tamamlandı'
  )
  SELECT jsonb_build_object(
    'totalOrders',      wo.total_orders,
    'overdueOrders',    wo.overdue_orders,
    'readyOrders',      wo.ready_orders,
    'inProgressOrders', wo.in_progress_orders,
    'todayProvas',      pr.today_provas
  )
  FROM wo, pr;
$$;
