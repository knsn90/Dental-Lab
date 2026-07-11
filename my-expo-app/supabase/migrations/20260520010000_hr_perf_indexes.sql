-- ============================================================
-- HR (İzin & Devam) listelerinin yüklenme süresini düşür
-- ============================================================

-- v_leave_summary view'ı employee_leaves'i LEFT JOIN edip GROUP BY yapıyor.
-- employee_id üzerinden lookup için composite index — RLS lab_id filtresi ile birlikte.
CREATE INDEX IF NOT EXISTS idx_employee_leaves_emp_status
  ON public.employee_leaves (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_emp_start
  ON public.employee_leaves (employee_id, start_date DESC);

-- Bekleyen izin filtresi sık çalıştırılıyor (sidebar badge + overview)
CREATE INDEX IF NOT EXISTS idx_employee_leaves_pending
  ON public.employee_leaves (lab_id, status)
  WHERE status = 'bekliyor';

-- employee_attendance lookups
CREATE INDEX IF NOT EXISTS idx_employee_attendance_emp_date
  ON public.employee_attendance (employee_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_attendance_lab_month
  ON public.employee_attendance (lab_id, work_date);

-- Aktif personel sık sorgulanıyor
CREATE INDEX IF NOT EXISTS idx_employees_lab_active
  ON public.employees (lab_id, is_active)
  WHERE is_active = true;

-- View'i materialized değil — yeniden derleme zorla ki yeni plan kullansın
ANALYZE public.employee_leaves;
ANALYZE public.employees;
ANALYZE public.employee_attendance;
