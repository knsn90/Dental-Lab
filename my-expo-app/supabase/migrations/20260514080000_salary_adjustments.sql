-- Salary adjustments — prim (bonus) ve ceza (penalty) olay bazlı log + otomatik prim eşiği.
-- Net maaş = base_salary + auto_bonus + manual_bonus - penalty (period_month bazında)

-- 1. profiles: otomatik prim kuralı (kullanıcı bazlı eşik + sipariş başı prim)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bonus_threshold_orders int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_per_extra_order  numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.bonus_threshold_orders IS
  'Otomatik prim eşiği — bu kadar sipariş tamamlandıktan sonra her ek sipariş için prim verilir';
COMMENT ON COLUMN profiles.bonus_per_extra_order IS
  'Eşik üstü her sipariş için verilecek prim (₺)';

-- 2. salary_adjustments tablosu — olay bazlı prim/ceza log
CREATE TABLE IF NOT EXISTS salary_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('bonus_auto', 'bonus_manual', 'penalty_rework', 'penalty_manual')),
  amount          numeric(10,2) NOT NULL CHECK (amount > 0),
  reason          text NOT NULL,
  work_order_id   uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  period_month    text NOT NULL,  -- 'YYYY-MM' formatı (ay bazlı raporlama)
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_adjustments_user_period
  ON salary_adjustments(user_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_salary_adjustments_work_order
  ON salary_adjustments(work_order_id) WHERE work_order_id IS NOT NULL;

COMMENT ON TABLE salary_adjustments IS 'Prim/ceza kayıt günlüğü — net maaş hesabı bu satırlardan toplanır';
COMMENT ON COLUMN salary_adjustments.type IS 'bonus_auto: kural tabanlı, bonus_manual: müdür ekledi, penalty_rework: rework cezası, penalty_manual: serbest ceza';
COMMENT ON COLUMN salary_adjustments.period_month IS 'YYYY-MM (hangi aya işlenecek)';

-- 3. RLS — sadece manager/admin görür ve yazar; çalışan kendi satırlarını okur
ALTER TABLE salary_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_admin_full" ON salary_adjustments;
CREATE POLICY "manager_admin_full" ON salary_adjustments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR p.role = 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR p.role = 'manager')
    )
  );

DROP POLICY IF EXISTS "user_read_own" ON salary_adjustments;
CREATE POLICY "user_read_own" ON salary_adjustments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. Net maaş hesabı için view (UI'da kolay sorgu)
CREATE OR REPLACE VIEW v_user_salary_summary AS
SELECT
  p.id                                     AS user_id,
  to_char(now(), 'YYYY-MM')                AS period_month,
  COALESCE(p.monthly_salary, 0)            AS base_salary,
  COALESCE(SUM(CASE WHEN sa.type IN ('bonus_auto','bonus_manual') THEN sa.amount ELSE 0 END), 0)
                                           AS total_bonus,
  COALESCE(SUM(CASE WHEN sa.type IN ('penalty_rework','penalty_manual') THEN sa.amount ELSE 0 END), 0)
                                           AS total_penalty,
  COALESCE(p.monthly_salary, 0)
    + COALESCE(SUM(CASE WHEN sa.type IN ('bonus_auto','bonus_manual') THEN sa.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN sa.type IN ('penalty_rework','penalty_manual') THEN sa.amount ELSE 0 END), 0)
                                           AS net_salary
FROM profiles p
LEFT JOIN salary_adjustments sa
  ON sa.user_id = p.id
 AND sa.period_month = to_char(now(), 'YYYY-MM')
GROUP BY p.id, p.monthly_salary;

GRANT SELECT ON v_user_salary_summary TO authenticated;
