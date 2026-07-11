-- ─────────────────────────────────────────────────────────────────────────────
-- Bonus Engine — flat_per_member dağıtımı
-- "Havuzdan her hak eden kişiye sabit X tutar" (ör. 1 EUR / kişi)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) CHECK constraint'i genişlet: 5. seçenek 'flat_per_member'
ALTER TABLE public.bonus_policies
  DROP CONSTRAINT IF EXISTS bonus_policies_distribution_method_check;

ALTER TABLE public.bonus_policies
  ADD CONSTRAINT bonus_policies_distribution_method_check
  CHECK (distribution_method IN (
    'equal',
    'by_salary',
    'by_points',
    'by_contribution',
    'flat_per_member'
  ));

-- 2) Yeni kolon: kişi başına sabit tutar
ALTER TABLE public.bonus_policies
  ADD COLUMN IF NOT EXISTS flat_amount_per_member NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bonus_policies.flat_amount_per_member IS
  'distribution_method=flat_per_member ise her hak eden kişiye verilecek sabit tutar (currency birimi)';
