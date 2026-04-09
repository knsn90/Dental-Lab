-- ──────────────────────────────────────────────────────────────────────────────
-- 007: Fix infinite recursion in RLS policies
-- ──────────────────────────────────────────────────────────────────────────────
-- Problem: Migration 006 added RLS policies that query the `profiles` table
-- inline (not via SECURITY DEFINER). This causes PostgreSQL to enter infinite
-- recursion: policy check → SELECT profiles → policy check → ...
--
-- Fix: All policies that need to inspect the current user's profile must use
-- SECURITY DEFINER helper functions. These run as the function owner (bypassing
-- RLS) and break the recursion.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop the broken policies ──────────────────────────────────────────────
DROP POLICY IF EXISTS "lab_manager_read_profiles"          ON profiles;
DROP POLICY IF EXISTS "lab_manager_update_doctor_approval" ON profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles"            ON profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles"          ON profiles;

-- ── 2. SECURITY DEFINER helper functions (no RLS recursion) ──────────────────

CREATE OR REPLACE FUNCTION is_lab_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND user_type = 'lab'
      AND role = 'manager'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND user_type = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ── 3. Recreate policies using SECURITY DEFINER functions ────────────────────

-- Admins can read ALL profiles (needed for users page, pending badge, etc.)
CREATE POLICY "admin_read_all_profiles"
  ON profiles FOR SELECT
  USING (is_admin_user());

-- Admins can update any profile (activate/deactivate users)
CREATE POLICY "admin_update_all_profiles"
  ON profiles FOR UPDATE
  USING (is_admin_user())
  WITH CHECK (true);

-- Lab managers can read all profiles (to see pending doctors)
CREATE POLICY "lab_manager_read_profiles"
  ON profiles FOR SELECT
  USING (is_lab_manager());

-- Lab managers can approve/reject pending doctors
CREATE POLICY "lab_manager_update_doctor_approval"
  ON profiles FOR UPDATE
  USING (is_lab_manager())
  WITH CHECK (true);

-- ── 4. Also ensure activity_logs policies use correct approach ───────────────
-- (Re-create the admin_select_logs policy cleanly)
DROP POLICY IF EXISTS "admin_select_logs" ON activity_logs;
CREATE POLICY "admin_select_logs"
  ON activity_logs FOR SELECT
  USING (is_admin_user());

