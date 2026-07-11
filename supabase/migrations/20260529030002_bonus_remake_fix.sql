-- ─────────────────────────────────────────────────────────────────────────────
-- Bonus Engine — remake sayım fix
-- work_orders.is_remake kolonu yok; bunun yerine order_stages.status='reddedildi'
-- üzerinden teknisyenin reddedilen aşama sayısını kullan.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_bonus_run(
  p_policy_id UUID,
  p_year      INTEGER,
  p_month     INTEGER,
  p_dry_run   BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT e.id, e.full_name, e.email, e.role, e.base_salary
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
$$;
