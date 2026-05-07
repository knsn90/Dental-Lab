-- ============================================================
-- Migration: Message Approval Workflow
--
-- Technician messages require manager/admin approval before
-- becoming visible to doctors and clinics.
--
-- Flow:
--   1. Technician sends message → approval_status = 'pending'
--   2. Manager/Admin sees pending → approves or rejects
--   3. Approved messages become visible to doctor/clinic
--   4. Manager/Admin/Lab-manager messages auto-approved
--
-- Rules:
--   - Lab users (admin, lab_manager, technician) always see ALL messages
--   - Doctor/clinic only see messages where approval_status = 'approved'
--   - Messages from admin/lab_manager are auto-approved on insert
--   - Messages from technician default to 'pending'
-- ============================================================

-- ── 1. Add approval columns ─────────────────────────────────
ALTER TABLE order_messages
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_order_messages_approval
  ON order_messages(approval_status)
  WHERE approval_status = 'pending';

-- ── 2. Update RLS — doctor/clinic can only see approved messages ──
DROP POLICY IF EXISTS "order_messages_access" ON order_messages;

-- Lab/admin: see ALL messages (including pending/rejected)
CREATE POLICY "order_messages_lab_access"
  ON order_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('lab', 'admin')
    )
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
    AND order_messages.sender_id = auth.uid()
  );

-- Doctor/clinic: only see APPROVED messages
CREATE POLICY "order_messages_doctor_clinic_access"
  ON order_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('doctor', 'clinic_admin')
    )
    AND order_messages.approval_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  );

-- Doctor/clinic: can INSERT their own messages (auto-approved)
CREATE POLICY "order_messages_doctor_clinic_insert"
  ON order_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('doctor', 'clinic_admin')
    )
    AND order_messages.sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  );

-- ── 3. Auto-set approval_status on INSERT ───────────────────
-- Technician → pending, everyone else → approved
CREATE OR REPLACE FUNCTION set_message_approval_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type TEXT;
  v_role TEXT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role
  FROM profiles WHERE id = NEW.sender_id;

  -- Technicians need approval
  IF v_user_type = 'lab' AND v_role = 'technician' THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  ELSE
    -- Admin, lab_manager, doctor, clinic_admin → auto-approved
    NEW.approval_status := 'approved';
    NEW.approved_by := NEW.sender_id;
    NEW.approved_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_approval ON order_messages;
CREATE TRIGGER trg_set_message_approval
  BEFORE INSERT ON order_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_message_approval_status();

-- ── 4. RPC: Approve a message (manager/admin only) ──────────
CREATE OR REPLACE FUNCTION approve_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type TEXT;
  v_role TEXT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role
  FROM profiles WHERE id = auth.uid();

  -- Only admin or lab manager can approve
  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
    SET approval_status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = p_message_id
      AND approval_status = 'pending';
  ELSE
    RAISE EXCEPTION 'Only managers and admins can approve messages';
  END IF;
END;
$$;

-- ── 5. RPC: Reject a message (manager/admin only) ───────────
CREATE OR REPLACE FUNCTION reject_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type TEXT;
  v_role TEXT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role
  FROM profiles WHERE id = auth.uid();

  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
    SET approval_status = 'rejected',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = p_message_id
      AND approval_status = 'pending';
  ELSE
    RAISE EXCEPTION 'Only managers and admins can reject messages';
  END IF;
END;
$$;

-- ── 6. RPC: Bulk approve all pending for an order ───────────
CREATE OR REPLACE FUNCTION approve_all_pending_messages(p_work_order_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type TEXT;
  v_role TEXT;
  v_count INT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role
  FROM profiles WHERE id = auth.uid();

  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
    SET approval_status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE work_order_id = p_work_order_id
      AND approval_status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  ELSE
    RAISE EXCEPTION 'Only managers and admins can approve messages';
  END IF;
END;
$$;
