-- 20261123130000_qr_checkin_gps_rule.sql
-- QR check-in konum kuralı sıkılaştırması (2026-11-23).
--
-- Sorun: lab konumu tanımlıyken personel konum iznini reddederse istemci 'qr_only'
-- gönderiyor ve fonksiyon mesafeyi HİÇ kontrol etmiyordu; check-in sayfasındaki
-- "GPS Olmadan Dene" düğmesi de mesafe dışındaki personele bu yolu açıyordu.
-- Tersine, konum TANIMSIZKEN izin veren personel 'lab_location_not_set' ile reddediliyordu.
--
-- Yeni kural:
--   konum tanımlı  → konum zorunlu (qr_gps + yarıçap içinde); qr_only → 'gps_required'
--   konum tanımsız → yalnız QR yeterli; kayıt 'qr_only'
-- Yalnız qr_checkin değişir; imza, dönen JSON şekli ve diğer hata kodları aynı.
-- Geri alma: 20261123130000_qr_checkin_gps_rule.down.sql

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
  v_method TEXT := p_method;
  v_lat    NUMERIC := p_lat;
  v_lng    NUMERIC := p_lng;
BEGIN
  -- Lab'ı token ile bul
  SELECT id, location_lat, location_lng, location_radius
    INTO v_lab
    FROM labs WHERE checkin_token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Konum kuralı (2026-11-23):
  --   * Lab konumu TANIMLIYSA konum zorunludur: qr_gps + koordinat gelmeli ve yarıçap
  --     içinde olmalı. Konum izni reddedilerek (qr_only) mesafe kontrolü atlanamaz.
  --   * Lab konumu TANIMLI DEĞİLSE yalnız QR yeterli; kayıt qr_only olarak yazılır.
  IF v_lab.location_lat IS NOT NULL AND v_lab.location_lng IS NOT NULL THEN
    IF p_method IS DISTINCT FROM 'qr_gps' OR p_lat IS NULL OR p_lng IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gps_required',
        'hint', 'Bu laboratuvarda giriş/çıkış için konum izni gerekli.');
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
    v_method := 'qr_gps';
  ELSE
    v_method := 'qr_only';
    IF p_method IS DISTINCT FROM 'qr_gps' THEN v_lat := NULL; v_lng := NULL; END IF;
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
      (v_lab.id, v_emp.id, v_today, v_now, v_method, v_lat, v_lng);
    RETURN jsonb_build_object(
      'ok', true, 'action', 'check_in',
      'time', to_char(v_now, 'HH24:MI'),
      'employee', v_emp.full_name
    );
  ELSIF v_att.check_out IS NULL THEN
    v_mins := EXTRACT(EPOCH FROM (v_now - v_att.check_in))::INT / 60;
    UPDATE employee_attendance
      SET check_out = v_now, check_out_method = v_method,
          check_out_lat = v_lat, check_out_lng = v_lng
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
