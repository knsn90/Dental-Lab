-- user_stage_skills.lab_id FK constraint sürekli ihlal ediliyor (lab profili
-- yapısı tutarsız). Multi-tenancy için strict FK gerekmiyor — kolonu bırak,
-- FK constraint'i kaldır.
ALTER TABLE public.user_stage_skills
  DROP CONSTRAINT IF EXISTS user_stage_skills_lab_id_fkey;

NOTIFY pgrst, 'reload schema';
