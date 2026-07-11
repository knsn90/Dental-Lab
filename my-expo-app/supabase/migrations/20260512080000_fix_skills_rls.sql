-- Fix user_stage_skills write policy — add explicit WITH CHECK so INSERTs
-- by admin/manager don't get silently rejected.

DROP POLICY IF EXISTS user_stage_skills_write ON public.user_stage_skills;

CREATE POLICY user_stage_skills_write ON public.user_stage_skills
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE user_type = 'admin'
         OR (user_type = 'lab' AND role IN ('manager', 'admin'))
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE user_type = 'admin'
         OR (user_type = 'lab' AND role IN ('manager', 'admin'))
    )
  );

NOTIFY pgrst, 'reload schema';
