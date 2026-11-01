-- Tutar tabloları ve prim yönetimi — 0b Görev 2 (spec: docs/superpowers/specs/2026-10-25-ik-tablolari-erisim-design.md).
-- Kullanıcı kararları: prim tutarları, prim/ceza düzeltmeleri ve bordro ayarları yalnız lab sahibine (maaş yetkisi);
-- lab müdürü prim hesaplayamaz/onaylayamaz/geri alamaz; prim KURALLARI lab içinde herkese açık (yazma yalnız sahip).
--   payroll_settings   okuma can_view_payroll(), yazma can_write_payroll()
--   performance_rules  okuma lab içi herkes, yazma can_write_payroll()
--   salary_adjustments manager_admin_full (admin veya role='manager' tam yetki) kalkar → okuma can_view_payroll()
--                      (+ mevcut user_read_own), yazma can_write_payroll(); RESTRICTIVE tenant_guard aynen
--   bonus_runs         okuma yalnız can_view_payroll() (dökümde herkesin prim tutarı var)
--   _is_bonus_manager() = can_write_payroll() (prim tablolarının yazma kuralları + calculate/approve/revert/post_bonus_run)
--   unpost_bonus_run   kendi kontrolü (admin veya personel kartı 'yonetici') → _is_bonus_manager()
-- Geri alma: supabase/rollbacks/20261025111000_pay_tables_rls.down.sql

drop policy if exists payroll_settings_lab_own on public.payroll_settings;
create policy ps_read on public.payroll_settings for select
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_view_payroll()));
create policy ps_write on public.payroll_settings for all
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

drop policy if exists perf_rules_lab_own on public.performance_rules;
create policy pr_read on public.performance_rules for select
  using (lab_id = (select public.get_my_lab_id()));
create policy pr_write on public.performance_rules for all
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()))
  with check (lab_id = (select public.get_my_lab_id()) and (select public.can_write_payroll()));

drop policy if exists manager_admin_full on public.salary_adjustments;
create policy sa_read on public.salary_adjustments for select to authenticated
  using ((select public.can_view_payroll()));
create policy sa_write on public.salary_adjustments for all to authenticated
  using ((select public.can_write_payroll()))
  with check ((select public.can_write_payroll()));

drop policy if exists bonus_runs_read on public.bonus_runs;
create policy bonus_runs_read on public.bonus_runs for select
  using (lab_id = (select public.get_my_lab_id()) and (select public.can_view_payroll()));

create or replace function public._is_bonus_manager()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- 0b (20261025111000): prim yönetimi yalnız maaş yazma yetkisinde (lab sahibi)
  select public.can_write_payroll();
$$;

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

  -- Yalnız prim yöneticisi = maaş yazma yetkisi (0b, 20261025111000; kullanıcı kararı: primleri yalnız lab sahibi yönetir)
  IF NOT public._is_bonus_manager() THEN
    RAISE EXCEPTION 'forbidden: only payroll managers can unpost a run';
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
