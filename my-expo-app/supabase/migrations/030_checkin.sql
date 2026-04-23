-- ═══════════════════════════════════════════════════════════════════════════
-- 030 — QR + GPS Check-in / Manuel Giriş
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Labs tablosuna konum + QR token ───────────────────────────────────────
ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS location_lat    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS location_lng    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS location_radius INT     NOT NULL DEFAULT 150,  -- metre
  ADD COLUMN IF NOT EXISTS checkin_token   TEXT    NOT NULL DEFAULT gen_random_uuid()::text;

-- ── 2. Attendance tablosuna yöntem + GPS + yetkili alanları ─────────────────
ALTER TABLE employee_attendance
  ADD COLUMN IF NOT EXISTS check_in_method   TEXT DEFAULT 'manual'
    CHECK (check_in_method  IN ('qr_gps','qr_only','manual')),
  ADD COLUMN IF NOT EXISTS check_out_method  TEXT DEFAULT 'manual'
    CHECK (check_out_method IN ('qr_gps','qr_only','manual')),
  ADD COLUMN IF NOT EXISTS check_in_lat      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_lng      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_out_lat     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_out_lng     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS recorded_by       UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── 3. QR check-in RPC — çalışan tarafında çağrılır ─────────────────────────
-- Hem giriş hem çıkış tek fonksiyonla yapılır:
--   • Günde ilk çağrı  → check_in kaydeder
--   • check_in var, check_out yok → check_out kaydeder
--   • İkisi de dolu    → yeni kayıt (ertesi mesai gibi) — hata döner
CREATE OR REPLACE FUNCTION qr_checkin(
  p_token     TEXT,          -- labs.checkin_token
  p_lat       NUMERIC,       -- GPS lat
  p_lng       NUMERIC,       -- GPS lng
  p_method    TEXT DEFAULT 'qr_gps'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_lab       RECORD;
  v_emp       RECORD;
  v_att       RECORD;
  v_now       TIME    := (now() AT TIME ZONE 'Europe/Istanbul')::TIME;
  v_today     DATE    := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_dist      NUMERIC;
BEGIN
  -- Lab'ı token ile bul
  SELECT id, location_lat, location_lng, location_radius
  INTO v_lab
  FROM labs WHERE checkin_token = p_token LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- GPS doğrulama (koordinatlar tanımlıysa)
  IF v_lab.location_lat IS NOT NULL AND p_method = 'qr_gps' THEN
    -- Haversine basit yaklaşımı (metre cinsinden)
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

  -- Çalışanı bul (çağıran kişi)
  SELECT e.id, e.full_name
  INTO v_emp
  FROM employees e
  JOIN profiles  p ON p.employee_id = e.id
  WHERE p.id = auth.uid() AND e.lab_id = v_lab.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'employee_not_found');
  END IF;

  -- Bugünkü kaydı bul
  SELECT * INTO v_att
  FROM employee_attendance
  WHERE employee_id = v_emp.id AND work_date = v_today;

  IF NOT FOUND THEN
    -- İlk giriş
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
    -- Çıkış kaydı
    UPDATE employee_attendance
    SET check_out = v_now, check_out_method = p_method,
        check_out_lat = p_lat, check_out_lng = p_lng
    WHERE id = v_att.id;

    RETURN jsonb_build_object(
      'ok', true, 'action', 'check_out',
      'time', to_char(v_now, 'HH24:MI'),
      'employee', v_emp.full_name,
      'work_minutes', EXTRACT(EPOCH FROM (v_now - v_att.check_in))::INT / 60
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'already_complete');
  END IF;
END;
$$;

-- ── 4. Manuel giriş RPC — yetkili tarafından çağrılır ───────────────────────
CREATE OR REPLACE FUNCTION manual_attendance(
  p_employee_id  UUID,
  p_work_date    DATE,
  p_check_in     TIME,
  p_check_out    TIME DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL
)
RETURNS employee_attendance
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_lab_id UUID := get_my_lab_id();
  v_result employee_attendance%ROWTYPE;
BEGIN
  INSERT INTO employee_attendance
    (lab_id, employee_id, work_date, check_in, check_out,
     check_in_method, check_out_method, notes, recorded_by)
  VALUES
    (v_lab_id, p_employee_id, p_work_date, p_check_in, p_check_out,
     'manual', CASE WHEN p_check_out IS NOT NULL THEN 'manual' ELSE NULL END,
     p_notes, auth.uid())
  ON CONFLICT (employee_id, work_date) DO UPDATE
    SET check_in         = COALESCE(EXCLUDED.check_in,  employee_attendance.check_in),
        check_out        = COALESCE(EXCLUDED.check_out, employee_attendance.check_out),
        check_in_method  = CASE WHEN EXCLUDED.check_in  IS NOT NULL THEN 'manual' ELSE employee_attendance.check_in_method  END,
        check_out_method = CASE WHEN EXCLUDED.check_out IS NOT NULL THEN 'manual' ELSE employee_attendance.check_out_method END,
        notes            = COALESCE(EXCLUDED.notes, employee_attendance.notes),
        recorded_by      = EXCLUDED.recorded_by
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
