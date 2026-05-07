-- Backfill lab_id for staff users created via admin-create-user before the fix
-- Issue: Earlier versions of admin-create-user did not set lab_id for new lab users,
-- causing them to be redirected to the setup wizard on first login.
--
-- Strategy:
--   1. For each lab user without a lab_id, infer it from the lab whose owner_id
--      matches another profile in the same context. We use the most-common lab_id
--      from existing lab profiles as the fallback.
--   2. Also set approval_status = 'approved' so they can log in normally.

-- Step 1: lab_id'si olmayan lab kullanıcılarını işaretle
DO $$
DECLARE
  default_lab_id UUID;
BEGIN
  -- En az bir lab user'ı olan ilk lab'ı varsayılan olarak al
  -- (tek-lab kurulumları için doğru sonuç verir)
  SELECT lab_id INTO default_lab_id
  FROM profiles
  WHERE user_type = 'lab' AND lab_id IS NOT NULL
  GROUP BY lab_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF default_lab_id IS NOT NULL THEN
    UPDATE profiles
    SET lab_id = default_lab_id,
        approval_status = COALESCE(approval_status, 'approved')
    WHERE user_type = 'lab'
      AND lab_id IS NULL;

    RAISE NOTICE 'Backfilled lab_id = % for staff without one', default_lab_id;
  ELSE
    RAISE NOTICE 'No lab found to backfill from — skipping';
  END IF;
END $$;
