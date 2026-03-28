-- ──────────────────────────────────────────────────────────
-- 006: Doctor approval workflow
-- ──────────────────────────────────────────────────────────

-- 1. Add approval_status column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  approval_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- 2. Update handle_new_user trigger: doctors start as pending/inactive
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := NEW.raw_user_meta_data->>'user_type';

  INSERT INTO profiles (id, user_type, full_name, clinic_name, role, phone, is_active, approval_status)
  VALUES (
    NEW.id,
    v_user_type,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'clinic_name',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN v_user_type = 'doctor' THEN false ELSE true END,
    CASE WHEN v_user_type = 'doctor' THEN 'pending' ELSE 'approved' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS: Lab managers can read all profiles (to see pending doctors)
DROP POLICY IF EXISTS "lab_manager_read_profiles" ON profiles;
CREATE POLICY "lab_manager_read_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid()
        AND p2.user_type = 'lab'
        AND p2.role = 'manager'
    )
  );

-- 4. RLS: Lab managers can approve/reject doctors (update is_active + approval_status)
DROP POLICY IF EXISTS "lab_manager_update_doctor_approval" ON profiles;
CREATE POLICY "lab_manager_update_doctor_approval"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    user_type = 'doctor'
    AND EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid()
        AND p2.user_type = 'lab'
        AND p2.role = 'manager'
    )
  )
  WITH CHECK (true);

-- 5. Index for fast pending queries
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status
  ON profiles(approval_status) WHERE approval_status = 'pending';
