-- Ensure all migration 047 skill/score columns exist + reload PostgREST cache.
-- Idempotent — safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skill_level       TEXT DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS allowed_types     TEXT[],
  ADD COLUMN IF NOT EXISTS trust_score       INT  DEFAULT 70,
  ADD COLUMN IF NOT EXISTS doctor_score      INT  DEFAULT 70,
  ADD COLUMN IF NOT EXISTS total_case_count  INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reject_count      INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_count   INT  DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_skill_level_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_skill_level_check
      CHECK (skill_level IN ('junior','mid','senior'));
  END IF;
END $$;

UPDATE public.profiles SET skill_level='mid'      WHERE skill_level      IS NULL;
UPDATE public.profiles SET trust_score=70        WHERE trust_score      IS NULL;
UPDATE public.profiles SET doctor_score=70       WHERE doctor_score     IS NULL;
UPDATE public.profiles SET total_case_count=0    WHERE total_case_count IS NULL;
UPDATE public.profiles SET reject_count=0        WHERE reject_count     IS NULL;
UPDATE public.profiles SET completed_count=0     WHERE completed_count  IS NULL;

NOTIFY pgrst, 'reload schema';
