-- Ensure profiles.allowed_types exists and refresh PostgREST schema cache.
-- Some installs reported "column not found" — defensive re-add + cache reload.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_types TEXT[];

COMMENT ON COLUMN public.profiles.allowed_types IS
  'İzin verilen iş tipleri (NULL = tümü). Skill matrisi için kullanılır.';

-- Migration 047 columns — defensive re-add for any installs missing them
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skill_level       TEXT DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS trust_score       INT  DEFAULT 70,
  ADD COLUMN IF NOT EXISTS doctor_score      INT  DEFAULT 70,
  ADD COLUMN IF NOT EXISTS total_case_count  INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reject_count      INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_count   INT  DEFAULT 0;

-- Add CHECK constraints idempotently
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_skill_level_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_skill_level_check
      CHECK (skill_level IN ('junior','mid','senior'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill NULL defaults
UPDATE public.profiles SET skill_level='mid'     WHERE skill_level     IS NULL;
UPDATE public.profiles SET trust_score=70       WHERE trust_score     IS NULL;
UPDATE public.profiles SET doctor_score=70      WHERE doctor_score    IS NULL;
UPDATE public.profiles SET total_case_count=0   WHERE total_case_count IS NULL;
UPDATE public.profiles SET reject_count=0       WHERE reject_count    IS NULL;
UPDATE public.profiles SET completed_count=0    WHERE completed_count IS NULL;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
