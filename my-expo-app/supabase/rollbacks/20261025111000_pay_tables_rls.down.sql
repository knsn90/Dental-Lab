-- GERİ ALMA: 20261025111000_pay_tables_rls.sql — 2026-10-25 canlı tanımları (supabase/rollbacks/20261025-0b-pay.before.txt).

drop policy if exists ps_read on public.payroll_settings;
drop policy if exists ps_write on public.payroll_settings;
drop policy if exists pr_read on public.performance_rules;
drop policy if exists pr_write on public.performance_rules;
drop policy if exists sa_read on public.salary_adjustments;
drop policy if exists sa_write on public.salary_adjustments;
drop policy if exists bonus_runs_read on public.bonus_runs;

create policy bonus_runs_read on public.bonus_runs as permissive for select to public
  using ((lab_id = get_my_lab_id()));
create policy payroll_settings_lab_own on public.payroll_settings as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
create policy perf_rules_lab_own on public.performance_rules as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
create policy manager_admin_full on public.salary_adjustments as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.user_type = 'admin'::text) OR (p.role = 'manager'::text))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.user_type = 'admin'::text) OR (p.role = 'manager'::text))))));

CREATE OR REPLACE FUNCTION public._is_bonus_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      -- profiles tarafı: admin veya lab manager
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (
              p.user_type = 'admin'
           OR (p.user_type = 'lab' AND COALESCE(p.role, 'manager') IN ('manager', 'admin'))
         )
    )
    OR EXISTS (
      -- employees tarafı: yetkili rol
      SELECT 1 FROM public.employees e
       JOIN public.profiles p ON p.id = auth.uid()
       WHERE e.lab_id = p.lab_id
         AND e.email = (SELECT email FROM auth.users WHERE id = auth.uid())
         AND e.role IN ('yonetici', 'hr_manager', 'finance_manager')
         AND e.is_active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.unpost_bonus_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   UUID := auth.uid();
  v_run      public.bonus_runs%ROWTYPE;
  v_user_type TEXT;
  v_emp_role TEXT;
  v_deleted  INTEGER;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- Sadece admin veya yonetici unpost edebilir
  SELECT user_type INTO v_user_type FROM profiles WHERE id = v_caller;
  SELECT e.role    INTO v_emp_role
    FROM employees e
    JOIN profiles p ON p.id = v_caller
   WHERE e.lab_id = p.lab_id AND e.email = (SELECT email FROM auth.users WHERE id = v_caller)
   LIMIT 1;

  IF NOT (v_user_type = 'admin' OR v_emp_role = 'yonetici') THEN
    RAISE EXCEPTION 'forbidden: only admin or yonetici can unpost a run';
  END IF;

  SELECT * INTO v_run FROM bonus_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'forbidden: cross-lab'; END IF;
  IF v_run.status <> 'posted' THEN RAISE EXCEPTION 'only posted runs can be unposted'; END IF;

  DELETE FROM salary_adjustments
   WHERE source_table = 'bonus_runs' AND source_id = p_run_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE bonus_runs
     SET status = 'approved', posted_by = NULL, posted_at = NULL
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'ok', true, 'run_id', p_run_id, 'status', 'approved',
    'adjustments_deleted', v_deleted
  );
END;
$function$;
