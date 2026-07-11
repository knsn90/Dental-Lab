-- ════════════════════════════════════════════════════════════════════════════
-- 20260529 — Payroll Bonus Engine · Faz 1
--
-- 8 tablo + RLS + role enum genişletme + audit trigger.
-- Bonus motoru: lab başına çoklu policy, teknisyen başına assignment,
-- aylık run, draft → approved → posted akışı.
--
-- Tüm tablolar `lab_id` ile RLS scope'lanır. Lab içi sadece bonus managers
-- (admin / yonetici / hr_manager / finance_manager) yazma yetkisine sahip.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) employees.role CHECK constraint — yeni 2 rol ekle
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (
    role IN (
      'teknisyen', 'sef_teknisyen', 'muhasebe', 'sekreter',
      'yonetici', 'hr_manager', 'finance_manager', 'diger'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Helper: caller bonus manager mı?
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._is_bonus_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public._is_bonus_manager() FROM public;
GRANT EXECUTE ON FUNCTION public._is_bonus_manager() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) bonus_policies — lab başına politika tanımı
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id               UUID NOT NULL DEFAULT get_my_lab_id() REFERENCES public.labs(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  mode                 TEXT NOT NULL CHECK (mode IN ('pool', 'individual', 'hybrid')),
  period_type          TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly')),
  currency             TEXT NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','EUR','GBP')),
  base_rate            NUMERIC(10,4) NOT NULL DEFAULT 0,       -- birim başına temel ücret (mode'a göre)
  distribution_method  TEXT CHECK (distribution_method IN ('equal','by_salary','by_points','by_contribution')),
  quality_window       TEXT NOT NULL DEFAULT 'period'
                       CHECK (quality_window IN ('period','rolling_30','rolling_60','rolling_90','all_time')),
  remake_penalty       TEXT NOT NULL DEFAULT 'ignore'
                       CHECK (remake_penalty IN ('ignore','exclude','penalty')),
  remake_penalty_points NUMERIC(10,2) NOT NULL DEFAULT 0,      -- her remake başına -X puan
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','archived')),
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_policies_lab    ON public.bonus_policies(lab_id);
CREATE INDEX IF NOT EXISTS idx_bonus_policies_status ON public.bonus_policies(status) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) bonus_eligible_work_types — bu policy'de hangi iş türleri sayılır
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_eligible_work_types (
  policy_id   UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  work_type   TEXT NOT NULL,
  PRIMARY KEY (policy_id, work_type)
);

CREATE INDEX IF NOT EXISTS idx_bonus_eligible_policy ON public.bonus_eligible_work_types(policy_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) bonus_thresholds — tier yapısı (0-599 → 0, 600+ → 1€, 1000+ → 1.5€)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_thresholds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  min_units   INTEGER NOT NULL CHECK (min_units >= 0),
  rate        NUMERIC(10,4) NOT NULL,            -- birim başına bonus (currency'de)
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_thresholds_policy ON public.bonus_thresholds(policy_id, min_units);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) bonus_difficulty_rules — work_type → multiplier
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_difficulty_rules (
  policy_id   UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  work_type   TEXT NOT NULL,
  multiplier  NUMERIC(6,3) NOT NULL DEFAULT 1.0 CHECK (multiplier >= 0),
  PRIMARY KEY (policy_id, work_type)
);

CREATE INDEX IF NOT EXISTS idx_bonus_difficulty_policy ON public.bonus_difficulty_rules(policy_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) bonus_stage_rates — stage_kind başına birim ücreti
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_stage_rates (
  policy_id        UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  stage_kind       TEXT NOT NULL CHECK (
    stage_kind IN ('TRIAGE','DESIGN','CAM','MILLING','SINTER','CERAMIC','FINISH','QC','MANAGER_REVIEW','DOCTOR_APPROVAL','SHIPPED','OTHER')
  ),
  amount_per_unit  NUMERIC(10,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (policy_id, stage_kind)
);

CREATE INDEX IF NOT EXISTS idx_bonus_stage_rates_policy ON public.bonus_stage_rates(policy_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) bonus_quality_rules — remake_pct → multiplier tier'ları
--    quality_window policy'de tanımlı (period / rolling_30 / vs.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_quality_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id         UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  max_remake_pct    NUMERIC(5,2) NOT NULL CHECK (max_remake_pct >= 0 AND max_remake_pct <= 100),
  multiplier        NUMERIC(5,3) NOT NULL CHECK (multiplier >= 0 AND multiplier <= 2),
  label             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_quality_policy ON public.bonus_quality_rules(policy_id, max_remake_pct);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) bonus_policy_assignments — teknisyen ↔ policy (tarih aralığı)
--    Aynı employee aynı tarihte birden fazla policy'e atanamaz (overlap önlenir trigger ile).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_policy_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id    UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  valid_from   DATE NOT NULL,
  valid_to     DATE,                              -- NULL = açık uçlu
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_assign_policy   ON public.bonus_policy_assignments(policy_id);
CREATE INDEX IF NOT EXISTS idx_bonus_assign_employee ON public.bonus_policy_assignments(employee_id, valid_from);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) bonus_runs — aylık hesaplama, draft → approved → posted
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE RESTRICT,
  lab_id          UUID NOT NULL,
  period_year     INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','posted')),
  -- Policy snapshot — config sonradan değişse bile run'ın anki hali korunur
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Tüm teknisyen bazlı detaylar: [{employee_id, units, points, bonus, quality_mult, …}, …]
  breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_units     INTEGER NOT NULL DEFAULT 0,
  total_pool      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payout    NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Audit
  calculated_by   UUID REFERENCES auth.users(id),
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  posted_by       UUID REFERENCES auth.users(id),
  posted_at       TIMESTAMPTZ,
  notes           TEXT
);

-- Aynı policy + ay için sadece tek POSTED run olabilir
CREATE UNIQUE INDEX IF NOT EXISTS uq_bonus_runs_posted_period
  ON public.bonus_runs(policy_id, period_year, period_month)
  WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_bonus_runs_lab_period ON public.bonus_runs(lab_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_bonus_runs_status    ON public.bonus_runs(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) bonus_rule_history — audit (her config değişikliği)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bonus_rule_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id     UUID NOT NULL REFERENCES public.bonus_policies(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES auth.users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT,
  old_snapshot  JSONB,
  new_snapshot  JSONB
);

CREATE INDEX IF NOT EXISTS idx_bonus_history_policy ON public.bonus_rule_history(policy_id, changed_at DESC);

-- Trigger: bonus_policies UPDATE → history snapshot
CREATE OR REPLACE FUNCTION public.trg_bonus_policy_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND row_to_json(OLD) IS DISTINCT FROM row_to_json(NEW) THEN
    INSERT INTO public.bonus_rule_history (policy_id, changed_by, field_changed, old_snapshot, new_snapshot)
    VALUES (
      NEW.id,
      auth.uid(),
      'policy',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bonus_policy_audit ON public.bonus_policies;
CREATE TRIGGER bonus_policy_audit
  AFTER UPDATE ON public.bonus_policies
  FOR EACH ROW EXECUTE FUNCTION public.trg_bonus_policy_audit();

-- updated_at maintainer
CREATE OR REPLACE FUNCTION public.trg_bonus_policy_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bonus_policy_touch ON public.bonus_policies;
CREATE TRIGGER bonus_policy_touch
  BEFORE UPDATE ON public.bonus_policies
  FOR EACH ROW EXECUTE FUNCTION public.trg_bonus_policy_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) RLS politikaları
-- ─────────────────────────────────────────────────────────────────────────────

-- Lab kapsamı: tüm tablolar lab_id veya policy.lab_id üzerinden kısıtlı
ALTER TABLE public.bonus_policies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_eligible_work_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_thresholds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_difficulty_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_stage_rates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_quality_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_policy_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_runs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_rule_history          ENABLE ROW LEVEL SECURITY;

-- ── bonus_policies ──
DROP POLICY IF EXISTS bonus_policies_read  ON public.bonus_policies;
DROP POLICY IF EXISTS bonus_policies_write ON public.bonus_policies;
CREATE POLICY bonus_policies_read  ON public.bonus_policies
  FOR SELECT USING (lab_id = get_my_lab_id());
CREATE POLICY bonus_policies_write ON public.bonus_policies
  FOR ALL    USING (lab_id = get_my_lab_id() AND _is_bonus_manager())
             WITH CHECK (lab_id = get_my_lab_id() AND _is_bonus_manager());

-- Helper makro: child tabloları policy.lab_id üzerinden lab-scope
DO $$
DECLARE child_table TEXT;
BEGIN
  FOR child_table IN SELECT unnest(ARRAY[
    'bonus_eligible_work_types',
    'bonus_thresholds',
    'bonus_difficulty_rules',
    'bonus_stage_rates',
    'bonus_quality_rules',
    'bonus_policy_assignments',
    'bonus_rule_history'
  ])
  LOOP
    EXECUTE format($f$DROP POLICY IF EXISTS %I_read  ON public.%I$f$, child_table, child_table);
    EXECUTE format($f$DROP POLICY IF EXISTS %I_write ON public.%I$f$, child_table, child_table);

    EXECUTE format($f$
      CREATE POLICY %I_read ON public.%I FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.bonus_policies p
                 WHERE p.id = %I.policy_id AND p.lab_id = get_my_lab_id())
      )$f$, child_table, child_table, child_table);

    EXECUTE format($f$
      CREATE POLICY %I_write ON public.%I FOR ALL USING (
        EXISTS (SELECT 1 FROM public.bonus_policies p
                 WHERE p.id = %I.policy_id AND p.lab_id = get_my_lab_id())
        AND _is_bonus_manager()
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.bonus_policies p
                 WHERE p.id = %I.policy_id AND p.lab_id = get_my_lab_id())
        AND _is_bonus_manager()
      )$f$, child_table, child_table, child_table, child_table);
  END LOOP;
END $$;

-- ── bonus_runs (lab_id var) ──
DROP POLICY IF EXISTS bonus_runs_read  ON public.bonus_runs;
DROP POLICY IF EXISTS bonus_runs_write ON public.bonus_runs;
CREATE POLICY bonus_runs_read  ON public.bonus_runs
  FOR SELECT USING (lab_id = get_my_lab_id());
CREATE POLICY bonus_runs_write ON public.bonus_runs
  FOR ALL    USING (lab_id = get_my_lab_id() AND _is_bonus_manager())
             WITH CHECK (lab_id = get_my_lab_id() AND _is_bonus_manager());

COMMIT;

NOTIFY pgrst, 'reload schema';
