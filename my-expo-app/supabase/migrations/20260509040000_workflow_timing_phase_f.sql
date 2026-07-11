-- ============================================================
-- 20260509 — Workflow Timing Phase F: Analytics views
--
-- Faz A'da topladığımız timing verisini agrege ederek lab manager'a
-- üretim zekası sağlayan view'leri oluşturur:
--   • station_performance_summary  — istasyon başına ortalama süreler
--   • order_timing_summary         — sipariş başına toplam süreler
--   • bottleneck_stations          — son 30 günde yavaşlamış istasyonlar
-- ============================================================

-- ── 1. Station performance summary ─────────────────────────────
-- Her istasyon için: tamamlanan stage sayısı, ortalama aktif süre,
-- ortalama kuyruk süresi, ortalama makine süresi, son 30 gün throughput.
CREATE OR REPLACE VIEW public.station_performance_summary AS
WITH stage_data AS (
  SELECT
    s.station_id,
    st.name                                                                 AS station_name,
    st.color                                                                AS station_color,
    st.lab_profile_id                                                       AS lab_id,
    s.id                                                                    AS stage_id,
    s.status,
    s.active_work_seconds,
    s.machine_runtime_seconds,
    s.queue_waiting_seconds,
    s.paused_seconds_total,
    s.completed_at,
    s.started_at,
    s.assigned_at,
    -- Elapsed = ilk activity'den completion'a kadar wall-clock
    CASE
      WHEN s.completed_at IS NOT NULL AND s.first_activity_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (s.completed_at - s.first_activity_at))::INTEGER
      WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at))::INTEGER
      ELSE NULL
    END AS elapsed_seconds
  FROM public.order_stages s
  JOIN public.lab_stations st ON st.id = s.station_id
  WHERE s.status IN ('tamamlandi','onaylandi')
)
SELECT
  station_id,
  station_name,
  station_color,
  lab_id,
  COUNT(*)                                                              AS completed_count,
  COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '30 days')    AS completed_last_30d,
  COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '7 days')     AS completed_last_7d,
  -- Ortalamalar
  ROUND(AVG(active_work_seconds))::INTEGER                              AS avg_active_seconds,
  ROUND(AVG(machine_runtime_seconds))::INTEGER                          AS avg_machine_seconds,
  ROUND(AVG(queue_waiting_seconds))::INTEGER                            AS avg_queue_seconds,
  ROUND(AVG(paused_seconds_total))::INTEGER                             AS avg_paused_seconds,
  ROUND(AVG(elapsed_seconds))::INTEGER                                  AS avg_elapsed_seconds,
  -- Median (Postgres 9.4+)
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY active_work_seconds)::INTEGER AS median_active_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY queue_waiting_seconds)::INTEGER AS median_queue_seconds,
  -- 90th percentile — slow tail
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY active_work_seconds)::INTEGER AS p90_active_seconds,
  -- En son tamamlanan
  MAX(completed_at)                                                     AS last_completion_at
FROM stage_data
GROUP BY station_id, station_name, station_color, lab_id;

COMMENT ON VIEW public.station_performance_summary IS
  'İstasyon bazında ortalama/median/p90 timing verisi. Lab manager dashboard için.';

-- ── 2. Order timing summary ────────────────────────────────────
-- Sipariş başına toplam aktif/makine/kuyruk süresi, stage sayısı, lead time.
CREATE OR REPLACE VIEW public.order_timing_summary AS
WITH per_order AS (
  SELECT
    s.work_order_id,
    COUNT(*)                                                             AS stage_count,
    COUNT(*) FILTER (WHERE s.status IN ('tamamlandi','onaylandi'))       AS completed_count,
    COUNT(*) FILTER (WHERE s.status = 'aktif')                           AS active_count,
    COUNT(*) FILTER (WHERE s.status = 'bloklu')                          AS blocked_count,
    SUM(s.active_work_seconds)                                           AS total_active_seconds,
    SUM(s.machine_runtime_seconds)                                       AS total_machine_seconds,
    SUM(s.queue_waiting_seconds)                                         AS total_queue_seconds,
    SUM(s.paused_seconds_total)                                          AS total_paused_seconds,
    MIN(s.started_at)                                                    AS first_started_at,
    MAX(s.completed_at) FILTER (WHERE s.status IN ('tamamlandi','onaylandi')) AS last_completed_at
  FROM public.order_stages s
  GROUP BY s.work_order_id
)
SELECT
  o.work_order_id,
  wo.order_number,
  wo.patient_name,
  wo.delivery_date,
  wo.is_urgent,
  wo.work_type,
  o.stage_count,
  o.completed_count,
  o.active_count,
  o.blocked_count,
  o.total_active_seconds,
  o.total_machine_seconds,
  o.total_queue_seconds,
  o.total_paused_seconds,
  o.first_started_at,
  o.last_completed_at,
  -- Lead time: ilk start'tan son complete'e wall-clock
  CASE
    WHEN o.last_completed_at IS NOT NULL AND o.first_started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (o.last_completed_at - o.first_started_at))::INTEGER
    ELSE NULL
  END AS lead_time_seconds,
  -- İş emrinden bu yana
  EXTRACT(EPOCH FROM (NOW() - wo.created_at))::INTEGER                   AS age_seconds
FROM per_order o
JOIN public.work_orders wo ON wo.id = o.work_order_id;

COMMENT ON VIEW public.order_timing_summary IS
  'Sipariş başına timing özeti — stage_count, total active/queue/machine, lead time.';

-- ── 3. Bottleneck detection ────────────────────────────────────
-- Son 30 günde diğer istasyonlardan belirgin yavaş olan istasyonlar.
-- Median active süresi tüm istasyonların ortalamasının 1.5x üzerindeyse "yavaş".
CREATE OR REPLACE VIEW public.bottleneck_stations AS
WITH lab_avg AS (
  SELECT
    lab_id,
    AVG(median_active_seconds)::INTEGER AS lab_median_active
  FROM public.station_performance_summary
  WHERE completed_last_30d > 0
  GROUP BY lab_id
)
SELECT
  s.station_id,
  s.station_name,
  s.station_color,
  s.lab_id,
  s.completed_last_30d,
  s.median_active_seconds,
  s.p90_active_seconds,
  s.median_queue_seconds,
  l.lab_median_active,
  -- Yavaşlık skoru: kendi median / lab ortalama
  ROUND((s.median_active_seconds::NUMERIC / NULLIF(l.lab_median_active, 0))::NUMERIC, 2) AS slowness_ratio,
  CASE
    WHEN s.median_active_seconds > l.lab_median_active * 2.0    THEN 'critical'
    WHEN s.median_active_seconds > l.lab_median_active * 1.5    THEN 'warning'
    WHEN s.median_queue_seconds  > 86400                        THEN 'queue'  -- >24h kuyruk
    ELSE 'normal'
  END AS bottleneck_level
FROM public.station_performance_summary s
JOIN lab_avg l ON l.lab_id = s.lab_id
WHERE s.completed_last_30d > 0;

COMMENT ON VIEW public.bottleneck_stations IS
  'Son 30 günde median aktif süresi lab ortalamasının üzerinde olan istasyonlar.';

-- ── 4. RLS — view'lere lab kullanıcıları erişsin ───────────────
-- View'ler otomatik olarak underlying table RLS'lerini takip eder
-- (order_stages + lab_stations RLS'leri zaten lab_id filtresi yapıyor).
-- Ekstra GRANT yok — authenticated için default SELECT açık.
