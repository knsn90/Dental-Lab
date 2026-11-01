-- Maaş tek kaynak — A2 (plan Görev 2). Bordro, prim ve toplu prim fonksiyonları ile v_employee_summary
-- maaşı employee_compensation'dan okur. Her fonksiyonda yalnız SELECT listesindeki `e.base_salary`
-- (fonksiyon başına 1 yer) alt sorguyla değişti; hesap mantığı aynen. Görünüm security_invoker
-- olduğu için maaş, ec_read kuralına göre gelir (maaş yetkisi / kendi satırı; diğerlerinde NULL).
-- Sütun adları ve sırası aynı → eski istemci bozulmaz.
-- Geri alma: supabase/rollbacks/20261025101000_payroll_reads_compensation.down.sql

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
  SELECT e.id, e.lab_id, (select ec.base_salary from public.employee_compensation ec where ec.employee_id = e.id) as base_salary
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
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_performance_bonuses(p_performance_id uuid)
 RETURNS SETOF performance_bonuses
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_perf  RECORD;
  v_emp   RECORD;
  v_rule  RECORD;
  v_bonus NUMERIC;
  v_rec   performance_bonuses%ROWTYPE;
BEGIN
  SELECT ep.*, e.role, (select ec.base_salary from public.employee_compensation ec where ec.employee_id = e.id) as base_salary
  INTO v_perf
  FROM employee_performance ep
  JOIN employees e ON e.id = ep.employee_id
  WHERE ep.id = p_performance_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Performans kaydı bulunamadı'; END IF;

  -- Önce eski primleri sil (kilitli değilse)
  DELETE FROM performance_bonuses
  WHERE performance_id = p_performance_id
    AND transferred_to_payroll = false;

  -- Her aktif kuralı değerlendir
  FOR v_rule IN
    SELECT * FROM performance_rules
    WHERE lab_id = v_perf.lab_id
      AND is_active = true
      AND (
        applies_to = 'all'
        OR applies_to = 'role_' || v_perf.role
      )
  LOOP
    -- Metrik değerini al
    DECLARE
      v_metric_val NUMERIC := CASE v_rule.metric
        WHEN 'orders_completed' THEN v_perf.orders_completed
        WHEN 'on_time_rate'     THEN v_perf.on_time_rate
        WHEN 'quality_pass_rate' THEN v_perf.quality_pass_rate
        WHEN 'revenue_generated' THEN v_perf.revenue_generated
        ELSE 0
      END;
    BEGIN
      v_bonus := 0;

      IF v_rule.threshold_type = 'min' AND v_metric_val >= v_rule.threshold_value THEN
        -- Eşiğe ulaştı → sabit veya yüzde prim
        v_bonus := CASE v_rule.bonus_type
          WHEN 'fixed'   THEN v_rule.bonus_amount
          WHEN 'percent' THEN ROUND(v_perf.base_salary * v_rule.bonus_amount / 100, 2)
          ELSE 0
        END;
      ELSIF v_rule.threshold_type = 'per_unit' THEN
        -- Her birim için prim
        v_bonus := ROUND(v_metric_val * v_rule.bonus_amount, 2);
      ELSIF v_rule.threshold_type = 'target' AND v_metric_val > v_rule.threshold_value THEN
        -- Hedef üstü: aşılan her birim için
        v_bonus := ROUND((v_metric_val - v_rule.threshold_value) * v_rule.bonus_amount, 2);
      END IF;

      IF v_bonus > 0 THEN
        INSERT INTO performance_bonuses (
          lab_id, performance_id, rule_id,
          description, metric_value, bonus_amount
        )
        VALUES (
          v_perf.lab_id, p_performance_id, v_rule.id,
          v_rule.name, v_metric_val, v_bonus
        )
        RETURNING * INTO v_rec;
        RETURN NEXT v_rec;
      END IF;
    END;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_bonus_run(p_policy_id uuid, p_year integer, p_month integer, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab_id          UUID := get_my_lab_id();
  v_policy          bonus_policies;
  v_breakdown       JSONB := '[]'::jsonb;
  v_total_units     INTEGER := 0;
  v_total_points    NUMERIC(14,2) := 0;
  v_total_pool      NUMERIC(14,2) := 0;
  v_total_payout    NUMERIC(14,2) := 0;
  v_sum_points      NUMERIC(14,2) := 0;
  v_sum_salary      NUMERIC(14,2) := 0;
  v_tier_rate       NUMERIC(14,4) := 0;
  v_pool_eligible   INTEGER := 0;
  v_snapshot        JSONB;
  v_run_id          UUID;
  v_period_start    DATE;
  v_period_end      DATE;
  v_quality_start   DATE;
  v_caller          UUID := auth.uid();
  v_emp             RECORD;
  v_user_id         UUID;
  v_units           INTEGER;
  v_points          NUMERIC(14,2);
  v_total_jobs      INTEGER;
  v_remakes         INTEGER;
  v_remake_pct      NUMERIC(10,4);
  v_quality_mult    NUMERIC(10,4);
  v_stage_bonus     NUMERIC(14,2);
  v_indiv_bonus     NUMERIC(14,2);
  v_rate            NUMERIC(14,4);
  v_active_count    INTEGER := 0;
  v_flat_amount     NUMERIC(14,2);
BEGIN
  IF NOT _is_bonus_manager() THEN
    RAISE EXCEPTION 'Yetkisiz: prim hesaplaması için bonus_manager rolü gerekli';
  END IF;

  SELECT * INTO v_policy FROM bonus_policies WHERE id = p_policy_id AND lab_id = v_lab_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Policy bulunamadı veya farklı laboratuvara ait';
  END IF;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end   := (v_period_start + interval '1 month' - interval '1 day')::date;
  v_quality_start := CASE v_policy.quality_window
    WHEN 'rolling_30' THEN v_period_end - interval '30 days'
    WHEN 'rolling_60' THEN v_period_end - interval '60 days'
    WHEN 'rolling_90' THEN v_period_end - interval '90 days'
    WHEN 'all_time'   THEN '1900-01-01'::date
    ELSE v_period_start
  END;

  FOR v_emp IN
    SELECT e.id, e.full_name, e.email, e.role, (select ec.base_salary from public.employee_compensation ec where ec.employee_id = e.id) as base_salary
      FROM employees e
     WHERE e.lab_id = v_lab_id
       AND e.is_active = true
       AND (
         NOT EXISTS (SELECT 1 FROM bonus_policy_assignments WHERE policy_id = p_policy_id)
         OR EXISTS (
           SELECT 1 FROM bonus_policy_assignments a
           WHERE a.policy_id = p_policy_id
             AND a.employee_id = e.id
             AND a.valid_from <= v_period_end
             AND (a.valid_to IS NULL OR a.valid_to >= v_period_start)
         )
       )
  LOOP
    SELECT u.id INTO v_user_id FROM auth.users u WHERE lower(u.email) = lower(v_emp.email) LIMIT 1;
    IF v_user_id IS NULL THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'employee_id', v_emp.id, 'employee_name', v_emp.full_name,
        'email', v_emp.email,
        'units', 0, 'points', 0, 'individual_bonus', 0, 'pool_share', 0, 'total_bonus', 0,
        'quality_multiplier', 1, 'remake_pct', 0, 'rejects', 0,
        'error', 'auth.users içinde eşleşen email yok'
      ));
      CONTINUE;
    END IF;

    WITH wo AS (
      SELECT wo.id, wo.work_type, COALESCE(array_length(wo.tooth_numbers, 1), 0) AS teeth
        FROM order_stages s
        JOIN work_orders  wo ON wo.id = s.work_order_id
       WHERE s.technician_id = v_user_id
         AND s.status = 'tamamlandi'
         AND s.completed_at >= v_period_start
         AND s.completed_at <= v_period_end + interval '1 day'
         AND (
           NOT EXISTS (SELECT 1 FROM bonus_eligible_work_types WHERE policy_id = p_policy_id)
           OR EXISTS (
             SELECT 1 FROM bonus_eligible_work_types
             WHERE policy_id = p_policy_id AND work_type = wo.work_type
           )
         )
    )
    SELECT COALESCE(SUM(teeth), 0),
           COALESCE(SUM(teeth * COALESCE(d.multiplier, 1)), 0)
      INTO v_units, v_points
      FROM wo
      LEFT JOIN bonus_difficulty_rules d
        ON d.policy_id = p_policy_id AND d.work_type = wo.work_type;

    SELECT COALESCE(SUM(v_units * COALESCE(r.amount_per_unit, 0)), 0)
      INTO v_stage_bonus
      FROM bonus_stage_rates r
     WHERE r.policy_id = p_policy_id;

    -- ── REMAKE / KALİTE — order_stages üzerinden ────────────────────
    -- Teknisyenin kalite penceresinde reddedilen aşama sayısı / toplam aşaması
    SELECT
      COUNT(*) FILTER (WHERE s.status = 'reddedildi'),
      COUNT(*) FILTER (WHERE s.status IN ('tamamlandi', 'reddedildi', 'onaylandi'))
      INTO v_remakes, v_total_jobs
      FROM order_stages s
     WHERE s.technician_id = v_user_id
       AND s.completed_at >= v_quality_start
       AND s.completed_at <= v_period_end + interval '1 day';
    v_remake_pct := CASE WHEN v_total_jobs > 0 THEN v_remakes::NUMERIC * 100 / v_total_jobs ELSE 0 END;

    SELECT q.multiplier INTO v_quality_mult
      FROM bonus_quality_rules q
     WHERE q.policy_id = p_policy_id AND q.max_remake_pct >= v_remake_pct
     ORDER BY q.max_remake_pct ASC LIMIT 1;
    IF v_quality_mult IS NULL THEN v_quality_mult := 1; END IF;

    IF v_policy.remake_penalty = 'penalty' THEN
      v_points := GREATEST(v_points - (v_remakes * COALESCE(v_policy.remake_penalty_points, 0)), 0);
    END IF;

    IF v_policy.mode IN ('individual', 'hybrid') THEN
      SELECT rate INTO v_rate FROM bonus_thresholds
       WHERE policy_id = p_policy_id AND min_units <= v_units
       ORDER BY min_units DESC LIMIT 1;
      IF v_rate IS NULL THEN v_rate := COALESCE(v_policy.base_rate, 0); END IF;
      v_indiv_bonus := round((v_units * v_rate + v_stage_bonus) * v_quality_mult, 2);
    ELSE
      v_indiv_bonus := 0;
    END IF;

    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'employee_id',        v_emp.id,
      'employee_name',      v_emp.full_name,
      'email',              v_emp.email,
      'auth_user_id',       v_user_id,
      'base_salary',        COALESCE(v_emp.base_salary, 0),
      'units',              v_units,
      'points',             round(v_points, 2),
      'stage_bonus',        round(v_stage_bonus, 2),
      'individual_bonus',   round(v_indiv_bonus, 2),
      'pool_share',         0,
      'quality_multiplier', v_quality_mult,
      'remake_pct',         round(v_remake_pct, 2),
      'rejects',            v_remakes,
      'total_bonus',        round(v_indiv_bonus, 2)
    ));

    v_total_units  := v_total_units + v_units;
    v_total_points := v_total_points + v_points;
    v_sum_points   := v_sum_points + v_points;
    v_sum_salary   := v_sum_salary + COALESCE(v_emp.base_salary, 0);
    v_total_payout := v_total_payout + v_indiv_bonus;
    v_active_count := v_active_count + 1;
  END LOOP;

  IF v_policy.mode IN ('pool', 'hybrid') THEN
    IF v_policy.distribution_method = 'flat_per_member' THEN
      v_flat_amount := COALESCE(v_policy.flat_amount_per_member, 0);
      v_total_pool  := v_active_count * v_flat_amount;
      IF v_flat_amount > 0 AND jsonb_array_length(v_breakdown) > 0 THEN
        v_breakdown := (
          SELECT jsonb_agg(
            CASE WHEN item ? 'error' THEN item
            ELSE jsonb_set(
              jsonb_set(item, '{pool_share}', to_jsonb(round(v_flat_amount, 2))),
              '{total_bonus}',
              to_jsonb(round(COALESCE((item->>'individual_bonus')::NUMERIC, 0) + v_flat_amount, 2))
            ) END
          )
          FROM jsonb_array_elements(v_breakdown) item
        );
        v_total_payout := v_total_payout + v_total_pool;
      END IF;
    ELSE
      SELECT rate INTO v_tier_rate FROM bonus_thresholds
       WHERE policy_id = p_policy_id AND min_units <= v_total_units
       ORDER BY min_units DESC LIMIT 1;
      IF v_tier_rate IS NULL THEN v_tier_rate := COALESCE(v_policy.base_rate, 0); END IF;

      SELECT MIN(min_units) INTO v_pool_eligible FROM bonus_thresholds
       WHERE policy_id = p_policy_id AND rate > 0;
      v_pool_eligible := COALESCE(v_pool_eligible, 0);

      IF v_total_units > v_pool_eligible THEN
        v_total_pool := (v_total_units - v_pool_eligible) * v_tier_rate;
      END IF;

      IF v_total_pool > 0 AND jsonb_array_length(v_breakdown) > 0 THEN
        v_breakdown := (
          SELECT jsonb_agg(
            CASE WHEN item ? 'error' THEN item
            ELSE jsonb_set(
              jsonb_set(item, '{pool_share}',
                to_jsonb(round(
                  CASE COALESCE(v_policy.distribution_method, 'equal')
                    WHEN 'equal'           THEN v_total_pool / jsonb_array_length(v_breakdown)
                    WHEN 'by_salary'       THEN v_total_pool * (COALESCE((item->>'base_salary')::NUMERIC, 0) / NULLIF(v_sum_salary, 0))
                    WHEN 'by_points'       THEN v_total_pool * (COALESCE((item->>'points')::NUMERIC, 0)      / NULLIF(v_sum_points, 0))
                    WHEN 'by_contribution' THEN v_total_pool * (COALESCE((item->>'points')::NUMERIC, 0)      / NULLIF(v_sum_points, 0))
                    ELSE                        v_total_pool / jsonb_array_length(v_breakdown)
                  END, 2))),
              '{total_bonus}',
              to_jsonb(round(
                COALESCE((item->>'individual_bonus')::NUMERIC, 0) +
                CASE COALESCE(v_policy.distribution_method, 'equal')
                  WHEN 'equal'           THEN v_total_pool / jsonb_array_length(v_breakdown)
                  WHEN 'by_salary'       THEN v_total_pool * (COALESCE((item->>'base_salary')::NUMERIC, 0) / NULLIF(v_sum_salary, 0))
                  WHEN 'by_points'       THEN v_total_pool * (COALESCE((item->>'points')::NUMERIC, 0)      / NULLIF(v_sum_points, 0))
                  WHEN 'by_contribution' THEN v_total_pool * (COALESCE((item->>'points')::NUMERIC, 0)      / NULLIF(v_sum_points, 0))
                  ELSE                        v_total_pool / jsonb_array_length(v_breakdown)
                END, 2))
            ) END
          )
          FROM jsonb_array_elements(v_breakdown) item
        );
        v_total_payout := v_total_payout + v_total_pool;
      END IF;
    END IF;
  END IF;

  v_snapshot := jsonb_build_object(
    'policy_id',              p_policy_id,
    'name',                   v_policy.name,
    'mode',                   v_policy.mode,
    'currency',               v_policy.currency,
    'base_rate',              v_policy.base_rate,
    'distribution_method',    v_policy.distribution_method,
    'flat_amount_per_member', v_policy.flat_amount_per_member,
    'quality_window',         v_policy.quality_window,
    'remake_penalty',         v_policy.remake_penalty,
    'period_year',            p_year,
    'period_month',           p_month
  );

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'run_id',       null,
      'status',       'preview',
      'breakdown',    v_breakdown,
      'total_units',  v_total_units,
      'total_pool',   round(v_total_pool, 2),
      'total_payout', round(v_total_payout, 2)
    );
  END IF;

  INSERT INTO bonus_runs (
    policy_id, lab_id, period_year, period_month, status,
    policy_snapshot, breakdown,
    total_units, total_pool, total_payout,
    calculated_by
  ) VALUES (
    p_policy_id, v_lab_id, p_year, p_month, 'draft',
    v_snapshot, v_breakdown,
    v_total_units, round(v_total_pool, 2), round(v_total_payout, 2),
    v_caller
  ) RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'run_id',       v_run_id,
    'status',       'draft',
    'breakdown',    v_breakdown,
    'total_units',  v_total_units,
    'total_pool',   round(v_total_pool, 2),
    'total_payout', round(v_total_payout, 2)
  );
END;
$function$
;

create or replace view public.v_employee_summary with (security_invoker=on) as
 SELECT e.id,
    e.lab_id,
    e.full_name,
    e.role,
    e.phone,
    (ec.base_salary)::numeric(12,2) AS base_salary,
    e.is_active,
    e.start_date,
    COALESCE(sp.total_paid, (0)::numeric) AS total_salary_paid,
    COALESCE(adv.total_advances, (0)::numeric) AS total_advances,
    COALESCE(adv.pending_advances, (0)::numeric) AS pending_advances,
    (EXISTS ( SELECT 1
           FROM salary_payments sp2
          WHERE ((sp2.employee_id = e.id) AND (sp2.period_year = (EXTRACT(year FROM CURRENT_DATE))::integer) AND (sp2.period_month = (EXTRACT(month FROM CURRENT_DATE))::integer)))) AS current_month_paid
   FROM ((employees e
     LEFT JOIN employee_compensation ec ON ((ec.employee_id = e.id))
     LEFT JOIN ( SELECT salary_payments.employee_id,
            sum(salary_payments.net_amount) AS total_paid
           FROM salary_payments
          GROUP BY salary_payments.employee_id) sp ON ((sp.employee_id = e.id)))
     LEFT JOIN ( SELECT employee_advances.employee_id,
            sum(employee_advances.amount) AS total_advances,
            sum(
                CASE
                    WHEN (NOT employee_advances.is_deducted) THEN employee_advances.amount
                    ELSE (0)::numeric
                END) AS pending_advances
           FROM employee_advances
          GROUP BY employee_advances.employee_id) adv ON ((adv.employee_id = e.id)));
