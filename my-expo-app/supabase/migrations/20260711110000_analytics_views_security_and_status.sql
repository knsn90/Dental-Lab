-- ============================================================
-- 20260711 — Analitik view'lar: güvenlik + doğru statü sayımı
--
-- K4 (güvenlik): v_active_orders_kanban / v_station_analytics /
-- v_technician_performance view'ları security_invoker DEĞİLDİ →
-- altta yatan tabloların RLS'ini bypass edip lab'lar arası veri
-- sızdırıyordu; ayrıca anon dahil SELECT/yazma grant'leri vardı.
--   → security_invoker=true (RLS sorgulayan kullanıcıya göre işler)
--   → anon'dan tüm haklar, authenticated'dan yazma hakları REVOKE.
--
-- B3 (doğruluk): performans view'ları 'onaylandi'/'reddedildi' sayıyordu;
-- gerçek üretim akışı aşamayı 'tamamlandi' yapar (canlıda onaylandi=0) →
-- tüm metrikler 0/NULL çıkıyordu. completed/approved artık
-- ('tamamlandi','onaylandi') birlikte sayar (geriye uyumlu).
--
-- CREATE OR REPLACE kolon listesi/sırası birebir korunur.
-- Idempotent.
-- ============================================================

REVOKE ALL ON public.v_active_orders_kanban   FROM anon;
REVOKE ALL ON public.v_station_analytics      FROM anon;
REVOKE ALL ON public.v_technician_performance FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.v_active_orders_kanban   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_station_analytics      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_technician_performance FROM authenticated;

CREATE OR REPLACE VIEW public.v_station_analytics AS
 SELECT s.id AS station_id,
    s.name AS station_name,
    s.lab_profile_id,
    count(os.id) AS total_stages,
    count(os.id) FILTER (WHERE os.status IN ('tamamlandi'::stage_status, 'onaylandi'::stage_status)) AS completed,
    count(os.id) FILTER (WHERE os.status = 'reddedildi'::stage_status) AS rejected,
    round(avg(os.duration_min) FILTER (WHERE os.duration_min IS NOT NULL))::integer AS avg_duration_min,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (os.duration_min::double precision)) FILTER (WHERE os.duration_min IS NOT NULL))::integer AS median_duration_min,
    round(avg(EXTRACT(epoch FROM os.started_at - os.assigned_at) / 60::numeric) FILTER (WHERE os.started_at IS NOT NULL AND os.assigned_at IS NOT NULL))::integer AS avg_wait_min
   FROM lab_stations s
     LEFT JOIN order_stages os ON os.station_id = s.id
  GROUP BY s.id, s.name, s.lab_profile_id;

CREATE OR REPLACE VIEW public.v_technician_performance AS
 SELECT p.id AS technician_id,
    p.full_name,
    count(os.id) AS total_stages,
    count(os.id) FILTER (WHERE os.status IN ('tamamlandi'::stage_status, 'onaylandi'::stage_status)) AS approved,
    count(os.id) FILTER (WHERE os.status = 'reddedildi'::stage_status) AS rejected,
    round(100.0 * count(os.id) FILTER (WHERE os.status IN ('tamamlandi'::stage_status, 'onaylandi'::stage_status))::numeric
      / NULLIF(count(os.id) FILTER (WHERE os.status = ANY (ARRAY['tamamlandi'::stage_status, 'onaylandi'::stage_status, 'reddedildi'::stage_status])), 0)::numeric, 1) AS approval_rate_pct,
    round(avg(os.duration_min) FILTER (WHERE os.duration_min IS NOT NULL))::integer AS avg_duration_min
   FROM profiles p
     LEFT JOIN order_stages os ON os.technician_id = p.id
  WHERE p.user_type = 'lab'::text
  GROUP BY p.id, p.full_name;

-- security_invoker EN SONDA — CREATE OR REPLACE reloption'ları sıfırlayabilir
ALTER VIEW public.v_active_orders_kanban    SET (security_invoker = true);
ALTER VIEW public.v_station_analytics       SET (security_invoker = true);
ALTER VIEW public.v_technician_performance  SET (security_invoker = true);
