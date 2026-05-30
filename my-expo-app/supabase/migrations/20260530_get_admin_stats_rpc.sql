-- ============================================================
-- Migration: get_admin_stats() RPC
--
-- Sorun: fetchOrderStats() tüm work_orders + profiles tablolarını
-- JS'e çekip bellek içinde hesaplıyordu. 1000+ sipariş → yavaş.
--
-- Çözüm: SQL aggregation ile tek RPC çağrısında tüm istatistikler.
-- JS artık COUNT, GROUP BY, JOIN yapmak yerine sadece sonuçları render eder.
-- ============================================================

CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
SELECT jsonb_build_object(
  'total_orders',    (SELECT COUNT(*)::int FROM work_orders),
  'today_orders',    (SELECT COUNT(*)::int FROM work_orders WHERE created_at::date = CURRENT_DATE),
  'overdue_orders',  (SELECT COUNT(*)::int FROM work_orders
                      WHERE status != 'teslim_edildi' AND delivery_date::date < CURRENT_DATE),
  'total_doctors',   (SELECT COUNT(*)::int FROM profiles WHERE user_type = 'doctor'),
  'total_lab_users', (SELECT COUNT(*)::int FROM profiles WHERE user_type = 'lab'),
  'by_status', (
    SELECT COALESCE(jsonb_object_agg(status, cnt), '{}')
    FROM (SELECT status, COUNT(*)::int AS cnt FROM work_orders GROUP BY status) s
  ),
  'by_work_type', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', work_type, 'count', cnt::int)), '[]')
    FROM (SELECT work_type, COUNT(*) AS cnt FROM work_orders
          GROUP BY work_type ORDER BY cnt DESC LIMIT 10) s
  ),
  'by_doctor', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', cnt::int)), '[]')
    FROM (
      SELECT p.full_name AS name, COUNT(*) AS cnt
      FROM work_orders w
      JOIN profiles p ON p.id = w.doctor_id
      GROUP BY p.full_name ORDER BY cnt DESC LIMIT 10
    ) s
  ),
  'monthly', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('month_key', month_key, 'count', cnt::int) ORDER BY month_key), '[]')
    FROM (
      SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
             COUNT(*) AS cnt
      FROM work_orders
      WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY date_trunc('month', created_at)
    ) s
  ),
  'recent_orders', (
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]')
    FROM (
      SELECT w.id, w.order_number, w.doctor_id, w.work_type, w.status,
             w.delivery_date, w.delivered_at, w.is_urgent, w.patient_name,
             w.department, w.created_at, w.notes, w.lab_notes,
             w.assigned_to, w.tooth_numbers, w.shade, w.machine_type,
             p.full_name   AS doctor_full_name,
             p.clinic_name AS doctor_clinic_name
      FROM work_orders w
      LEFT JOIN profiles p ON p.id = w.doctor_id
      ORDER BY w.created_at DESC LIMIT 8
    ) r
  )
);
$$;
