-- upsert_payroll_from_attendance: maaş/finans yetkisi şartı (denetim K1 ek — bağımsız inceleme I1, 2026-10-24).
--
-- Sorun: SECURITY DEFINER, authenticated'a açık, yalnız "aynı lab" kontrol ediyordu. Personeli
-- görebilen her kullanıcı (lab müdürü, kurye) bu fonksiyonla herkesin hesaplanmış bordrosunu
-- (net, kesinti, SGK) okuyabilir ve maaş yetkisi olmadan 'taslak' bordro yazabilirdi.
-- Yeni: auth.uid() varsa can_view_payroll() şart. İstemci ve cron bu fonksiyonu çağırmıyor.
-- Gövdenin geri kalanı canlı tanımla (2026-10-24) BİREBİR aynı.
-- Geri alma: supabase/rollbacks/20261024115000_payroll_upsert_guard.down.sql

CREATE OR REPLACE FUNCTION public.upsert_payroll_from_attendance(p_employee_id uuid, p_period text)
 RETURNS employee_payroll
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp       RECORD;
  v_settings  RECORD;
  v_att       RECORD;
  v_daily     NUMERIC;
  v_hourly    NUMERIC;
  v_ot_hours  NUMERIC;
  v_result    employee_payroll%ROWTYPE;
BEGIN
  -- Çalışan bilgisi
  SELECT e.id, e.lab_id, e.base_salary
  INTO v_emp
  FROM employees e
  WHERE e.id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışan bulunamadı: %', p_employee_id;
  END IF;

  -- 02.3.1 tenant guard: authenticated caller must belong to the employee's lab
  -- (same rule as employee_payroll RLS). NULL auth.uid() = trusted service/cron
  -- (anon EXECUTE revoked below, so anon cannot reach here).
  IF auth.uid() IS NOT NULL
     AND NOT (v_emp.lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu çalışanın bordrosunu oluşturamazsınız (lab %)', v_emp.lab_id
      USING errcode = '42501';
  END IF;

  -- Denetim K1 ek (2026-10-24): aynı lab yetmez — bordro verisi maaş yetkisi ister
  -- (employee_payroll_read ile aynı kural). NULL auth.uid() = güvenilir servis/cron.
  IF auth.uid() IS NOT NULL AND NOT can_view_payroll() THEN
    RAISE EXCEPTION 'yetkisiz: bordro oluşturmak için maaş/finans yetkisi gerekir'
      USING errcode = '42501';
  END IF;

  -- Ayarlar (yoksa default)
  SELECT
    COALESCE(ps.working_days_per_month, 22)   AS wdm,
    COALESCE(ps.late_penalty_per_incident, 0) AS late_pen,
    COALESCE(ps.overtime_multiplier, 1.5)     AS ot_mult,
    COALESCE(ps.include_sgk, false)           AS incl_sgk,
    COALESCE(ps.sgk_employee_rate, 0.14)      AS sgk_emp_r,
    COALESCE(ps.sgk_employer_rate, 0.205)     AS sgk_er_r
  INTO v_settings
  FROM (SELECT NULL) dummy
  LEFT JOIN payroll_settings ps ON ps.employee_id = p_employee_id;

  -- Devam verisi
  SELECT
    COUNT(*) FILTER (WHERE a.status NOT IN ('resmi_tatil'))            AS total_rec,
    COUNT(*) FILTER (WHERE a.status = 'devamsiz')                      AS absent_d,
    COUNT(*) FILTER (WHERE a.status = 'gec')                           AS late_c,
    COUNT(*) FILTER (WHERE a.status IN ('izinli','hastalik'))          AS leave_d,
    COALESCE(SUM(a.overtime_minutes), 0)                               AS ot_min
  INTO v_att
  FROM employee_attendance a
  WHERE a.employee_id = p_employee_id
    AND to_char(a.work_date, 'YYYY-MM') = p_period;

  -- Günlük / saatlik ücret
  v_daily   := v_emp.base_salary / GREATEST(v_settings.wdm, 1);
  v_hourly  := v_daily / 8.0;
  v_ot_hours := COALESCE(v_att.ot_min, 0)::NUMERIC / 60.0;

  -- Bordroyu upsert et
  INSERT INTO employee_payroll (
    lab_id, employee_id, period,
    base_salary, working_days_month,
    actual_work_days, absent_days, late_count, leave_days, overtime_minutes,
    absence_deduction, late_deduction, overtime_bonus,
    sgk_employee, sgk_employer,
    total_deductions, total_bonuses, gross_salary, net_salary,
    status, updated_at
  )
  VALUES (
    v_emp.lab_id, p_employee_id, p_period,
    v_emp.base_salary, v_settings.wdm,
    COALESCE(v_att.total_rec, 0), COALESCE(v_att.absent_d, 0),
    COALESCE(v_att.late_c, 0),   COALESCE(v_att.leave_d, 0),
    COALESCE(v_att.ot_min, 0),
    ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2),
    ROUND(COALESCE(v_att.late_c, 0)   * v_settings.late_pen, 2),
    ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2),
    CASE WHEN v_settings.incl_sgk
         THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END,
    CASE WHEN v_settings.incl_sgk
         THEN ROUND(v_emp.base_salary * v_settings.sgk_er_r, 2) ELSE 0 END,
    -- total_deductions
    ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2)
      + ROUND(COALESCE(v_att.late_c, 0) * v_settings.late_pen, 2)
      + CASE WHEN v_settings.incl_sgk
             THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END,
    -- total_bonuses
    ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2),
    -- gross_salary
    v_emp.base_salary,
    -- net_salary
    GREATEST(0,
      v_emp.base_salary
      - (ROUND(COALESCE(v_att.absent_d, 0) * v_daily, 2)
         + ROUND(COALESCE(v_att.late_c, 0) * v_settings.late_pen, 2)
         + CASE WHEN v_settings.incl_sgk
                THEN ROUND(v_emp.base_salary * v_settings.sgk_emp_r, 2) ELSE 0 END)
      + ROUND(v_ot_hours * v_hourly * v_settings.ot_mult, 2)
    ),
    'taslak',
    now()
  )
  ON CONFLICT (employee_id, period) DO UPDATE
    SET
      base_salary          = EXCLUDED.base_salary,
      working_days_month   = EXCLUDED.working_days_month,
      actual_work_days     = EXCLUDED.actual_work_days,
      absent_days          = EXCLUDED.absent_days,
      late_count           = EXCLUDED.late_count,
      leave_days           = EXCLUDED.leave_days,
      overtime_minutes     = EXCLUDED.overtime_minutes,
      absence_deduction    = EXCLUDED.absence_deduction,
      late_deduction       = EXCLUDED.late_deduction,
      overtime_bonus       = EXCLUDED.overtime_bonus,
      sgk_employee         = EXCLUDED.sgk_employee,
      sgk_employer         = EXCLUDED.sgk_employer,
      total_deductions     = EXCLUDED.total_deductions,
      total_bonuses        = EXCLUDED.total_bonuses,
      gross_salary         = EXCLUDED.gross_salary,
      net_salary           = EXCLUDED.net_salary,
      updated_at           = now()
    WHERE employee_payroll.status = 'taslak'  -- onaylandıysa değiştirme
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
