-- 20261111094000_kullanici_is_istatistigi — Kullanıcılar ekranı detay paneli istatistikleri (kullanıcı kararı 2026-11-11).
-- NEDEN: panel work_orders'ta OLMAYAN created_by sütununu sorguluyordu → istek hata veriyor, hata yutuluyor,
-- HERKES için 0 görünüyordu. Ayrıca işin kime ait olduğu role göre farklı yerde:
--   doctor     → work_orders.doctor_id (polimorfik: doctors.id ya da profil id → _doctor_profile_owns_doctor)
--   clinic     → hekimin kliniği (doctors.clinic_id / profiles.clinic_id) = hedefin clinic_id'si
--   technician → order_stages.technician_id      courier → deliveries.courier_id
--   lab        → work_orders.assigned_to (lab yöneticisi / admin)
-- get_user_work_stats(p_user_id) (authenticated):
--   Kapı: platform admini YA DA çağıran lab tarafı (admin/lab) + get_my_lab_id() + (manage_users ya da
--   can_manage_lab_settings). Lab tarafı hedef aynı lab'da olmalı. Her sayım çağıranın lab'ıyla SINIRLI
--   (work_orders.lab_id / deliveries.lab_id) → başka lab'ın verisi asla dönmez. Aksi halde US_SCOPE (42501).
--   Dönüş: {kind, total, active, overdue, done_month, queued, cancelled, items:[{id, order_number, label, overdue}]}
--   "Bu ay" lab saat dilimiyle (lab_today). Hasta adı dönmez.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_work_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab   uuid := get_my_lab_id();
  v_me    profiles;
  v_t     profiles;
  v_kind  text;
  v_today date;
  v_m0    date;
  v_res   jsonb;
BEGIN
  SELECT * INTO v_me FROM profiles WHERE id = auth.uid();
  IF v_lab IS NULL OR NOT (
       is_platform_admin()
       OR (v_me.user_type IN ('admin', 'lab') AND (has_permission('manage_users') OR can_manage_lab_settings()))
     ) THEN
    RAISE EXCEPTION 'US_SCOPE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'US_SCOPE' USING ERRCODE = '42501'; END IF;

  v_kind := CASE
    WHEN v_t.user_type = 'doctor' THEN 'doctor'
    WHEN v_t.user_type IN ('clinic', 'clinic_admin', 'clinic_secretary') THEN 'clinic'
    WHEN v_t.user_type = 'lab' AND v_t.role = 'technician' THEN 'technician'
    WHEN v_t.user_type = 'lab' AND v_t.role = 'courier' THEN 'courier'
    ELSE 'lab' END;
  IF v_kind IN ('technician', 'courier', 'lab') AND v_t.lab_id IS DISTINCT FROM v_lab THEN
    RAISE EXCEPTION 'US_SCOPE' USING ERRCODE = '42501';
  END IF;

  v_today := lab_today(v_lab);
  v_m0    := date_trunc('month', v_today)::date;

  IF v_kind IN ('doctor', 'clinic', 'lab') THEN
    WITH o AS (
      SELECT wo.id, wo.order_number, wo.work_type, wo.status::text AS st, wo.delivery_date, wo.delivered_at
        FROM work_orders wo
       WHERE wo.lab_id = v_lab
         AND CASE v_kind
               WHEN 'doctor' THEN wo.doctor_id = v_t.id OR _doctor_profile_owns_doctor(v_t.id, wo.doctor_id)
               WHEN 'clinic' THEN v_t.clinic_id IS NOT NULL AND (
                      EXISTS (SELECT 1 FROM doctors d WHERE d.id = wo.doctor_id AND d.clinic_id = v_t.clinic_id)
                   OR EXISTS (SELECT 1 FROM profiles dp WHERE dp.id = wo.doctor_id AND dp.clinic_id = v_t.clinic_id))
               ELSE wo.assigned_to = v_t.id
             END
    ), a AS (
      SELECT o.*, (o.delivery_date IS NOT NULL AND o.delivery_date::date < v_today) AS late
        FROM o WHERE o.st NOT IN ('teslim_edildi', 'iptal')
    )
    SELECT jsonb_build_object(
      'kind', v_kind,
      'total', (SELECT count(*) FROM o WHERE o.st <> 'iptal'),
      'active', (SELECT count(*) FROM a),
      'overdue', (SELECT count(*) FROM a WHERE a.late),
      'done_month', (SELECT count(*) FROM o WHERE o.st = 'teslim_edildi' AND o.delivered_at IS NOT NULL
                                              AND lab_today(v_lab, o.delivered_at) >= v_m0),
      'queued', NULL, 'cancelled', NULL,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'order_number', x.order_number,
                                                             'label', x.work_type, 'overdue', x.late))
                           FROM (SELECT * FROM a ORDER BY a.late DESC, a.delivery_date NULLS LAST LIMIT 5) x), '[]'::jsonb))
    INTO v_res;

  ELSIF v_kind = 'technician' THEN
    WITH s AS (
      SELECT st.status::text AS ss, st.completed_at, wo.id AS wo_id, wo.order_number, ls.name AS station,
             (wo.delivery_date IS NOT NULL AND wo.delivery_date::date < v_today
              AND wo.status::text NOT IN ('teslim_edildi', 'iptal')) AS late
        FROM order_stages st
        JOIN work_orders wo ON wo.id = st.work_order_id AND wo.lab_id = v_lab
        LEFT JOIN lab_stations ls ON ls.id = st.station_id
       WHERE st.technician_id = v_t.id
    ), h AS (  -- elindeki (kapanmamış, sırada olmayan)
      SELECT * FROM s WHERE s.ss IN ('aktif', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden')
    )
    SELECT jsonb_build_object(
      'kind', v_kind,
      'active', (SELECT count(*) FROM h),
      'queued', (SELECT count(*) FROM s WHERE s.ss = 'bekliyor'),
      'overdue', (SELECT count(*) FROM s WHERE s.late AND s.ss NOT IN ('tamamlandi', 'onaylandi', 'skipped', 'reddedildi')),
      'done_month', (SELECT count(*) FROM s WHERE s.ss IN ('tamamlandi', 'onaylandi') AND s.completed_at IS NOT NULL
                                              AND lab_today(v_lab, s.completed_at) >= v_m0),
      'total', (SELECT count(*) FROM s WHERE s.ss IN ('tamamlandi', 'onaylandi')),
      'cancelled', NULL,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.wo_id, 'order_number', x.order_number,
                                                             'label', x.station, 'overdue', x.late))
                           FROM (SELECT * FROM s WHERE s.ss IN ('aktif', 'durakladi', 'makine_bekliyor', 'onay_bekliyor',
                                                                 'bloklu', 'yeniden', 'bekliyor')
                                  ORDER BY (s.ss = 'bekliyor'), s.late DESC LIMIT 5) x), '[]'::jsonb))
    INTO v_res;

  ELSE  -- courier
    WITH d AS (
      SELECT dl.status::text AS ds, dl.delivered_at, dl.destination_name, wo.id AS wo_id, wo.order_number
        FROM deliveries dl
        LEFT JOIN work_orders wo ON wo.id = dl.work_order_id
       WHERE dl.courier_id = v_t.id AND dl.lab_id = v_lab
    ), a AS (
      SELECT * FROM d WHERE d.ds IN ('atandi', 'teslim_alindi', 'yolda', 'beklemede')
    )
    SELECT jsonb_build_object(
      'kind', v_kind,
      'active', (SELECT count(*) FROM a),
      'done_month', (SELECT count(*) FROM d WHERE d.ds = 'teslim_edildi' AND d.delivered_at IS NOT NULL
                                              AND lab_today(v_lab, d.delivered_at) >= v_m0),
      'total', (SELECT count(*) FROM d WHERE d.ds = 'teslim_edildi'),
      'cancelled', (SELECT count(*) FROM d WHERE d.ds IN ('iptal', 'iade')),
      'overdue', NULL, 'queued', NULL,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.wo_id, 'order_number', COALESCE(x.order_number, '—'),
                                                             'label', x.destination_name, 'overdue', false))
                           FROM (SELECT * FROM a LIMIT 5) x), '[]'::jsonb))
    INTO v_res;
  END IF;

  RETURN v_res;
END $function$;

REVOKE ALL ON FUNCTION public.get_user_work_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_work_stats(uuid) TO authenticated, service_role;

COMMIT;
