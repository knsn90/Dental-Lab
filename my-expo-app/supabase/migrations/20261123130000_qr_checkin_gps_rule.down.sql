-- Geri alma: 20261123130000_qr_checkin_gps_rule — qr_checkin'in önceki canlı tanımı
-- (pg_get_functiondef ile doğrulandı, 2026-11-23).
CREATE OR REPLACE FUNCTION public.qr_checkin(p_token text, p_lat numeric, p_lng numeric, p_method text DEFAULT 'qr_gps'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab    RECORD;
  v_emp    RECORD;
  v_att    RECORD;
  v_email  TEXT;
  v_now    TIME := (now() AT TIME ZONE 'Europe/Istanbul')::TIME;
  v_today  DATE := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_dist   NUMERIC;
  v_mins   INT;
BEGIN
  -- Lab'ı token ile bul
  SELECT id, location_lat, location_lng, location_radius
    INTO v_lab
    FROM labs WHERE checkin_token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- GPS zorunlu: qr_gps yönteminde lab konumu tanımlı olmalı (fail-safe)
  IF p_method = 'qr_gps' THEN
    IF v_lab.location_lat IS NULL OR v_lab.location_lng IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'lab_location_not_set',
        'hint', 'Lab yöneticisi Check-in Ayarları''ndan laboratuvar konumunu girmeli.');
    END IF;
    v_dist := 111320 * SQRT(
      POWER(p_lat - v_lab.location_lat, 2) +
      POWER((p_lng - v_lab.location_lng) * COS(RADIANS(v_lab.location_lat)), 2)
    );
    IF v_dist > v_lab.location_radius THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'out_of_range',
        'distance_m', ROUND(v_dist),
        'allowed_m',  v_lab.location_radius
      );
    END IF;
  END IF;

  -- Çağıran profili (email) auth.users'tan al
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_session');
  END IF;

  -- Çalışan kaydını email ile eşleştir (profiles.full_name fallback)
  SELECT e.id, e.full_name
    INTO v_emp
    FROM employees e
    WHERE e.lab_id = v_lab.id
      AND e.is_active
      AND (
        LOWER(e.email) = LOWER(v_email)
        OR LOWER(e.full_name) = LOWER((SELECT full_name FROM profiles WHERE id = auth.uid()))
      )
    ORDER BY (LOWER(e.email) = LOWER(v_email)) DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'employee_not_found',
      'hint', 'Bu e-posta ile eşleşen çalışan bulunamadı. Lab yöneticisi Personel ekranından e-posta ekleyebilir.');
  END IF;

  -- Bugünkü kayıt
  SELECT * INTO v_att
    FROM employee_attendance
    WHERE employee_id = v_emp.id AND work_date = v_today;

  IF NOT FOUND THEN
    INSERT INTO employee_attendance
      (lab_id, employee_id, work_date, check_in, check_in_method, check_in_lat, check_in_lng)
    VALUES
      (v_lab.id, v_emp.id, v_today, v_now, p_method, p_lat, p_lng);
    RETURN jsonb_build_object(
      'ok', true, 'action', 'check_in',
      'time', to_char(v_now, 'HH24:MI'),
      'employee', v_emp.full_name
    );
  ELSIF v_att.check_out IS NULL THEN
    v_mins := EXTRACT(EPOCH FROM (v_now - v_att.check_in))::INT / 60;
    UPDATE employee_attendance
      SET check_out = v_now, check_out_method = p_method,
          check_out_lat = p_lat, check_out_lng = p_lng
      WHERE id = v_att.id;
    RETURN jsonb_build_object(
      'ok', true, 'action', 'check_out',
      'time', to_char(v_now, 'HH24:MI'),
      'employee', v_emp.full_name,
      'work_minutes', v_mins
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'already_complete');
  END IF;
END;
$function$;
