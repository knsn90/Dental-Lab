-- Teknisyen detay performans view'i — EditUserModal'da gösterilecek 6 metrik.
-- Hem tüm zamanlar (kalite, hız, kuyruk) hem de bu ay (rework, aktiflik) bilgisi.

CREATE OR REPLACE VIEW v_technician_performance_detail AS
WITH stage_data AS (
  SELECT
    os.technician_id,
    os.status,
    os.duration_min,
    os.queue_waiting_seconds,
    os.completed_at,
    os.started_at,
    wo.delivery_date,
    to_char(COALESCE(os.completed_at, os.started_at, now()), 'YYYY-MM') AS month_key
  FROM order_stages os
  LEFT JOIN work_orders wo ON wo.id = os.work_order_id
  WHERE os.technician_id IS NOT NULL
)
SELECT
  p.id                                                                   AS technician_id,
  p.full_name,
  to_char(now(), 'YYYY-MM')                                              AS current_period,

  -- 1. KALİTE (tüm zamanlar)
  COUNT(*) FILTER (WHERE sd.status = 'onaylandi')                        AS total_approved,
  COUNT(*) FILTER (WHERE sd.status = 'reddedildi')                       AS total_rejected,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE sd.status = 'onaylandi')
    / NULLIF(COUNT(*) FILTER (WHERE sd.status IN ('onaylandi','reddedildi')), 0),
    1
  )                                                                      AS quality_pct,

  -- 2. HIZ (avg duration)
  ROUND(AVG(sd.duration_min) FILTER (WHERE sd.duration_min IS NOT NULL))::int
                                                                          AS avg_duration_min,

  -- 3. ZAMANINDA TESLİM
  COUNT(*) FILTER (
    WHERE sd.status = 'onaylandi' AND sd.delivery_date IS NOT NULL
      AND sd.completed_at::date <= sd.delivery_date
  )                                                                      AS on_time_count,
  COUNT(*) FILTER (
    WHERE sd.status = 'onaylandi' AND sd.delivery_date IS NOT NULL
  )                                                                      AS total_with_deadline,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE sd.status = 'onaylandi' AND sd.delivery_date IS NOT NULL
        AND sd.completed_at::date <= sd.delivery_date
    )
    / NULLIF(COUNT(*) FILTER (
      WHERE sd.status = 'onaylandi' AND sd.delivery_date IS NOT NULL
    ), 0),
    1
  )                                                                      AS on_time_pct,

  -- 4. KUYRUK (atandı → başladı ortalama saniye)
  ROUND(AVG(sd.queue_waiting_seconds) FILTER (WHERE sd.queue_waiting_seconds IS NOT NULL))::int
                                                                          AS avg_queue_wait_sec,

  -- 5. BU AY REWORK SAYISI
  COUNT(*) FILTER (
    WHERE sd.month_key = to_char(now(), 'YYYY-MM') AND sd.status = 'reddedildi'
  )                                                                      AS monthly_rework_count,

  -- 6. BU AY AKTİFLİK (onaylanmış stage sayısı)
  COUNT(*) FILTER (
    WHERE sd.month_key = to_char(now(), 'YYYY-MM') AND sd.status = 'onaylandi'
  )                                                                      AS monthly_approved_count

FROM profiles p
LEFT JOIN stage_data sd ON sd.technician_id = p.id
WHERE p.user_type = 'lab'
GROUP BY p.id, p.full_name;

GRANT SELECT ON v_technician_performance_detail TO authenticated;

COMMENT ON VIEW v_technician_performance_detail IS
  'Teknisyen performans metrikleri: kalite/hız/zamanında teslim/kuyruk + bu ay rework & aktiflik';
