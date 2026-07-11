-- ════════════════════════════════════════════════════════════════════════════
-- 20260529 — Bonus Engine · Faz 2
--
-- Server-side hesaplama motoru:
--   • calculate_bonus_run(policy, year, month, dry_run) → JSONB
--     Tüm policy state'i snapshot'lar; her teknisyen için unit/point/quality/pool
--     paylaşımını hesaplar. dry_run=true → kaydetmez, sadece preview döner.
--   • approve_bonus_run(run_id)  → draft → approved (kilitler)
--   • post_bonus_run(run_id)     → approved → posted + salary_adjustments yaz
--   • unpost_bonus_run(run_id)   → posted → approved + salary_adjustments sil
--
-- Tüm fonksiyonlar SECURITY DEFINER + _is_bonus_manager() check'i.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) salary_adjustments — bonus run kaynağı için 2 audit kolonu
--    (post/unpost akışında run ↔ adjustment eşleşmesi için)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.salary_adjustments
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id    UUID;

CREATE INDEX IF NOT EXISTS idx_salary_adjustments_source
  ON public.salary_adjustments(source_table, source_id)
  WHERE source_table IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) calculate_bonus_run — ana hesap motoru
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
  v_caller          UUID := auth.uid();
  v_policy          public.bonus_policies%ROWTYPE;
  v_period_start    DATE;
  v_period_end      DATE;
  v_quality_start   DATE;
  v_eligible_types  TEXT[];
  v_thresholds      JSONB;
  v_difficulty      JSONB;
  v_stage_rates     JSONB;
  v_quality_rules   JSONB;
  v_breakdown       JSONB := '[]'::jsonb;
  v_total_units     INTEGER := 0;
  v_total_points    NUMERIC(14,2) := 0;
  v_total_pool      NUMERIC(14,2) := 0;
  v_total_payout    NUMERIC(14,2) := 0;
  v_run_id          UUID;
  v_emp             RECORD;
  v_units           INTEGER;
  v_points          NUMERIC(14,2);
  v_stage_bonus     NUMERIC(14,2);
  v_total_done      INTEGER;
  v_total_rej       INTEGER;
  v_remake_pct      NUMERIC(5,2);
  v_quality_mult    NUMERIC(5,3);
  v_tier_rate       NUMERIC(10,4);
  v_indiv_bonus     NUMERIC(14,2);
  v_pool_eligible   INTEGER;
  v_sum_points      NUMERIC(14,2) := 0;
  v_sum_salary      NUMERIC(14,2) := 0;
  v_snapshot        JSONB;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT _is_bonus_manager() THEN
    RAISE EXCEPTION 'forbidden: only bonus managers can run calculations';
  END IF;

  -- Policy yükle + scope kontrol
  SELECT * INTO v_policy FROM bonus_policies WHERE id = p_policy_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'policy not found'; END IF;
  IF v_policy.lab_id <> get_my_lab_id() THEN
    RAISE EXCEPTION 'forbidden: policy belongs to another lab';
  END IF;

  -- Takvim ayı
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end   := (v_period_start + INTERVAL '1 month')::DATE;

  -- Quality window
  v_quality_start := CASE v_policy.quality_window
    WHEN 'rolling_30' THEN (v_period_end - INTERVAL '30 days')::DATE
    WHEN 'rolling_60' THEN (v_period_end - INTERVAL '60 days')::DATE
    WHEN 'rolling_90' THEN (v_period_end - INTERVAL '90 days')::DATE
    WHEN 'all_time'   THEN '2020-01-01'::DATE
    ELSE                   v_period_start
  END;

  -- Eligible work types (boşsa tüm work_type'lar geçerli)
  SELECT COALESCE(array_agg(work_type), ARRAY[]::TEXT[])
    INTO v_eligible_types
    FROM bonus_eligible_work_types WHERE policy_id = p_policy_id;

  -- Helper snapshot JSONs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'min_units', min_units, 'rate', rate, 'label', label
         ) ORDER BY min_units), '[]'::jsonb)
    INTO v_thresholds FROM bonus_thresholds WHERE policy_id = p_policy_id;

  SELECT COALESCE(jsonb_object_agg(work_type, multiplier), '{}'::jsonb)
    INTO v_difficulty FROM bonus_difficulty_rules WHERE policy_id = p_policy_id;

  SELECT COALESCE(jsonb_object_agg(stage_kind, amount_per_unit), '{}'::jsonb)
    INTO v_stage_rates FROM bonus_stage_rates WHERE policy_id = p_policy_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'max_remake_pct', max_remake_pct, 'multiplier', multiplier, 'label', label
         ) ORDER BY max_remake_pct), '[]'::jsonb)
    INTO v_quality_rules FROM bonus_quality_rules WHERE policy_id = p_policy_id;

  -- Per-employee döngü
  FOR v_emp IN
    SELECT DISTINCT e.id AS employee_id, e.full_name, e.base_salary, e.email,
           u.id AS auth_user_id
      FROM employees e
      JOIN bonus_policy_assignments a
        ON a.employee_id = e.id AND a.policy_id = p_policy_id
      LEFT JOIN auth.users u
        ON lower(u.email) = lower(e.email)
     WHERE e.is_active = true
       AND a.valid_from <= v_period_end
       AND (a.valid_to IS NULL OR a.valid_to >= v_period_start)
  LOOP
    v_units        := 0;
    v_points       := 0;
    v_stage_bonus  := 0;
    v_total_done   := 0;
    v_total_rej    := 0;
    v_quality_mult := 1.0;
    v_indiv_bonus  := 0;

    -- Auth mapping yoksa kaydet ve geç
    IF v_emp.auth_user_id IS NULL THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'employee_id', v_emp.employee_id,
        'full_name',   v_emp.full_name,
        'error',       'auth user mapping not found (employees.email ↔ auth.users.email)'
      ));
      CONTINUE;
    END IF;

    -- Units + points: tamamlanan stage'lerden (eligible work_types filtrele)
    SELECT
      COALESCE(SUM(GREATEST(COALESCE(array_length(wo.tooth_numbers, 1), 1), 1)), 0)::INTEGER,
      COALESCE(SUM(
        GREATEST(COALESCE(array_length(wo.tooth_numbers, 1), 1), 1)
        * COALESCE((v_difficulty->>wo.work_type)::NUMERIC, 1.0)
      ), 0)
    INTO v_units, v_points
    FROM order_stages s
    JOIN work_orders  wo ON wo.id = s.work_order_id
    WHERE s.technician_id = v_emp.auth_user_id
      AND s.status IN ('tamamlandi', 'onaylandi')
      AND s.completed_at >= v_period_start
      AND s.completed_at <  v_period_end
      AND (array_length(v_eligible_types, 1) IS NULL OR wo.work_type = ANY(v_eligible_types));

    -- Stage-based bonus (stage_kind × amount_per_unit)
    SELECT COALESCE(SUM(
      GREATEST(COALESCE(array_length(wo.tooth_numbers, 1), 1), 1)
      * COALESCE((v_stage_rates->>_stage_for_station(s.station_id))::NUMERIC, 0)
    ), 0)
    INTO v_stage_bonus
    FROM order_stages s
    JOIN work_orders wo ON wo.id = s.work_order_id
    WHERE s.technician_id = v_emp.auth_user_id
      AND s.status IN ('tamamlandi', 'onaylandi')
      AND s.completed_at >= v_period_start
      AND s.completed_at <  v_period_end;

    -- Kalite penceresi içinde remake oranı
    SELECT
      COUNT(*) FILTER (WHERE s.status IN ('tamamlandi','onaylandi')
                         AND s.completed_at >= v_quality_start
                         AND s.completed_at <  v_period_end),
      COUNT(*) FILTER (WHERE s.status = 'reddedildi'
                         AND COALESCE(s.completed_at, s.assigned_at) >= v_quality_start
                         AND COALESCE(s.completed_at, s.assigned_at) <  v_period_end)
    INTO v_total_done, v_total_rej
    FROM order_stages s
    WHERE s.technician_id = v_emp.auth_user_id;

    IF (v_total_done + v_total_rej) = 0 THEN
      v_remake_pct := 0;
    ELSE
      v_remake_pct := (v_total_rej::NUMERIC / (v_total_done + v_total_rej)) * 100;
    END IF;

    -- En küçük max_remake_pct ≥ pct olan tier
    SELECT multiplier INTO v_quality_mult
      FROM bonus_quality_rules
     WHERE policy_id = p_policy_id AND max_remake_pct >= v_remake_pct
     ORDER BY max_remake_pct ASC
     LIMIT 1;
    IF v_quality_mult IS NULL THEN v_quality_mult := 1.0; END IF;

    -- Remake penalty (mode 'penalty')
    IF v_policy.remake_penalty = 'penalty' AND v_total_rej > 0 THEN
      v_points := GREATEST(0, v_points - (v_total_rej * v_policy.remake_penalty_points));
    END IF;

    -- Individual bonus tier
    IF v_policy.mode IN ('individual', 'hybrid') THEN
      SELECT rate INTO v_tier_rate
        FROM bonus_thresholds
       WHERE policy_id = p_policy_id AND min_units <= v_units
       ORDER BY min_units DESC
       LIMIT 1;
      IF v_tier_rate IS NULL THEN v_tier_rate := COALESCE(v_policy.base_rate, 0); END IF;
      v_indiv_bonus := (v_units * v_tier_rate + v_stage_bonus) * v_quality_mult;
    ELSE
      v_indiv_bonus := v_stage_bonus * v_quality_mult;
    END IF;

    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'employee_id',      v_emp.employee_id,
      'auth_user_id',     v_emp.auth_user_id,
      'full_name',        v_emp.full_name,
      'base_salary',      v_emp.base_salary,
      'units',            v_units,
      'points',           round(v_points, 2),
      'stage_bonus',      round(v_stage_bonus, 2),
      'remake_pct',       round(v_remake_pct, 2),
      'quality_mult',     v_quality_mult,
      'individual_bonus', round(v_indiv_bonus, 2),
      'pool_share',       0,
      'total_bonus',      round(v_indiv_bonus, 2)
    ));

    v_total_units  := v_total_units + v_units;
    v_total_points := v_total_points + v_points;
    v_sum_points   := v_sum_points + v_points;
    v_sum_salary   := v_sum_salary + COALESCE(v_emp.base_salary, 0);
    v_total_payout := v_total_payout + v_indiv_bonus;
  END LOOP;

  -- Pool hesaplama (pool veya hybrid)
  IF v_policy.mode IN ('pool', 'hybrid') THEN
    SELECT rate INTO v_tier_rate
      FROM bonus_thresholds
     WHERE policy_id = p_policy_id AND min_units <= v_total_units
     ORDER BY min_units DESC
     LIMIT 1;
    IF v_tier_rate IS NULL THEN v_tier_rate := COALESCE(v_policy.base_rate, 0); END IF;

    SELECT MIN(min_units) INTO v_pool_eligible
      FROM bonus_thresholds
     WHERE policy_id = p_policy_id AND rate > 0;
    v_pool_eligible := COALESCE(v_pool_eligible, 0);

    IF v_total_units > v_pool_eligible THEN
      v_total_pool := (v_total_units - v_pool_eligible) * v_tier_rate;
    END IF;

    -- Dağıt
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

  -- Policy snapshot (run'la birlikte saklanır)
  v_snapshot := jsonb_build_object(
    'policy_id',           p_policy_id,
    'name',                v_policy.name,
    'mode',                v_policy.mode,
    'currency',            v_policy.currency,
    'base_rate',           v_policy.base_rate,
    'distribution_method', v_policy.distribution_method,
    'quality_window',      v_policy.quality_window,
    'remake_penalty',      v_policy.remake_penalty,
    'remake_penalty_pts',  v_policy.remake_penalty_points,
    'eligible_work_types', v_eligible_types,
    'thresholds',          v_thresholds,
    'difficulty',          v_difficulty,
    'stage_rates',         v_stage_rates,
    'quality_rules',       v_quality_rules
  );

  -- Dry run → kaydetme, JSON döndür
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run',         true,
      'policy_id',       p_policy_id,
      'period_year',     p_year,
      'period_month',    p_month,
      'total_units',     v_total_units,
      'total_pool',      round(v_total_pool, 2),
      'total_payout',    round(v_total_payout, 2),
      'breakdown',       v_breakdown,
      'policy_snapshot', v_snapshot
    );
  END IF;

  -- Persist (status='draft')
  INSERT INTO bonus_runs (
    policy_id, lab_id, period_year, period_month, status,
    policy_snapshot, breakdown,
    total_units, total_pool, total_payout,
    calculated_by, calculated_at
  ) VALUES (
    p_policy_id, v_policy.lab_id, p_year, p_month, 'draft',
    v_snapshot, v_breakdown,
    v_total_units, round(v_total_pool, 2), round(v_total_payout, 2),
    v_caller, now()
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'dry_run',      false,
    'run_id',       v_run_id,
    'total_units',  v_total_units,
    'total_pool',   round(v_total_pool, 2),
    'total_payout', round(v_total_payout, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_bonus_run(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) approve_bonus_run — draft → approved
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_bonus_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_run    public.bonus_runs%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT _is_bonus_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_run FROM bonus_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'forbidden: cross-lab'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'run is not in draft (current: %)', v_run.status; END IF;

  UPDATE bonus_runs
     SET status = 'approved', approved_by = v_caller, approved_at = now()
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'status', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_bonus_run(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) revert_bonus_run — approved → draft (re-calculate için)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revert_bonus_run_to_draft(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_run    public.bonus_runs%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT _is_bonus_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_run FROM bonus_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'forbidden: cross-lab'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'only approved runs can be reverted'; END IF;

  UPDATE bonus_runs
     SET status = 'draft', approved_by = NULL, approved_at = NULL
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'status', 'draft');
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_bonus_run_to_draft(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) post_bonus_run — approved → posted + salary_adjustments yaz
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_bonus_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_run      public.bonus_runs%ROWTYPE;
  v_row      JSONB;
  v_count    INTEGER := 0;
  v_user_id  UUID;
  v_amount   NUMERIC(14,2);
  v_period   TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT _is_bonus_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_run FROM bonus_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'forbidden: cross-lab'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'only approved runs can be posted (current: %)', v_run.status; END IF;

  -- 'YYYY-MM' formatı (salary_adjustments.period_month text)
  v_period := format('%s-%s', v_run.period_year, lpad(v_run.period_month::TEXT, 2, '0'));

  -- Her breakdown satırı için salary_adjustments insert
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_run.breakdown)
  LOOP
    IF v_row ? 'error' THEN CONTINUE; END IF;

    v_user_id := (v_row->>'auth_user_id')::UUID;  -- profiles.id = auth.users.id
    v_amount  := COALESCE((v_row->>'total_bonus')::NUMERIC, 0);
    IF v_user_id IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO salary_adjustments (
      user_id, type, amount, reason, period_month,
      source_table, source_id, created_by, created_at
    ) VALUES (
      v_user_id,
      'bonus_auto',
      v_amount,
      format('Bonus run · %s', v_period),
      v_period,
      'bonus_runs',
      p_run_id,
      v_caller,
      now()
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE bonus_runs
     SET status = 'posted', posted_by = v_caller, posted_at = now()
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'ok', true, 'run_id', p_run_id, 'status', 'posted',
    'adjustments_written', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_bonus_run(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) unpost_bonus_run — posted → approved + salary_adjustments sil
--    Sadece admin/yonetici; HR/Finance manager unpost edemez.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unpost_bonus_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.unpost_bonus_run(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
