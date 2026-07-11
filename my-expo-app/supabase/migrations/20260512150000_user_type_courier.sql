-- ============================================================
-- 20260512150000 — profiles.user_type CHECK constraint'e 'courier' ekle
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_type_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_user_type_check;
  END IF;

  ALTER TABLE profiles
    ADD CONSTRAINT profiles_user_type_check
    CHECK (user_type IN ('lab', 'doctor', 'admin', 'clinic_admin', 'courier'));
END$$;

NOTIFY pgrst, 'reload schema';
