-- 20261025130000_attendance_writes_fix.sql
-- Devam yazımları (2026-10-25). work_minutes GENERATED ALWAYS (026_hr.sql): veritabanı
-- check_in/check_out'tan kendisi hesaplar, elle yazılamaz. İki fonksiyon bu sütuna yazdığı
-- için 428C9 ile düşüyordu:
--   * qr_checkin çıkış UPDATE'i → QR ile ÇIKIŞ hiç çalışmıyordu (giriş çalışıyor).
--   * manual_attendance INSERT/ON CONFLICT → elle devam kaydı hiç çalışmıyordu.
-- Ayrıca manual_attendance yalnız profil rolü 'manager' olanı (is_lab_manager) kabul ediyordu;
-- tablo yazma kuralıyla (ea_write) aynı yetkiye bağlanır: has_permission('manage_attendance')
-- → lab sahibi + lab müdürü. Teknisyen yine giremez. Dönen JSON şekli değişmez.
-- Geri alma: supabase/rollbacks/20261025130000_attendance_writes_fix.down.sql
-- Canlı tanım (önce): supabase/rollbacks/20261025130000_attendance_writes_fix.before.txt

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

CREATE OR REPLACE FUNCTION public.manual_attendance(p_employee_id uuid, p_work_date date, p_check_in text, p_check_out text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab   uuid;
  v_in    time;
  v_out   time;
  v_mins  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_session');
  END IF;
  IF NOT has_permission('manage_attendance') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT lab_id INTO v_lab FROM employees WHERE id = p_employee_id;
  IF v_lab IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'employee_not_found');
  END IF;
  IF v_lab <> get_my_lab_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_in  := p_check_in::time;
  v_out := NULLIF(p_check_out, '')::time;
  v_mins := CASE WHEN v_out IS NOT NULL
                 THEN GREATEST(0, (EXTRACT(EPOCH FROM (v_out - v_in)) / 60)::int)
                 ELSE NULL END;

  INSERT INTO employee_attendance
    (lab_id, employee_id, work_date, check_in, check_out,
     check_in_method, check_out_method, notes, recorded_by)
  VALUES
    (v_lab, p_employee_id, p_work_date, v_in, v_out,
     'manual', CASE WHEN v_out IS NOT NULL THEN 'manual' END, p_notes, auth.uid())
  ON CONFLICT (employee_id, work_date) DO UPDATE SET
     check_in         = EXCLUDED.check_in,
     check_out        = EXCLUDED.check_out,
     check_in_method  = 'manual',
     check_out_method = EXCLUDED.check_out_method,
     notes            = COALESCE(EXCLUDED.notes, employee_attendance.notes),
     recorded_by      = auth.uid();

  RETURN jsonb_build_object('ok', true, 'work_minutes', v_mins);
END;
$function$;
