-- ============================================================
-- Dental Lab App — Initial Schema
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- TYPES
-- ──────────────────────────────────────────────────────────
CREATE TYPE work_order_status AS ENUM (
  'alindi',           -- Alındı (Received)
  'uretimde',         -- Üretimde (In Production)
  'kalite_kontrol',   -- Kalite Kontrol (Quality Control)
  'teslimata_hazir',  -- Teslimata Hazır (Ready for Delivery)
  'teslim_edildi'     -- Teslim Edildi (Delivered)
);

CREATE TYPE machine_type AS ENUM (
  'milling',      -- Kuru kazıma (zirkonyum frezeleme)
  '3d_printing'   -- SprintRay 3D baskı
);

-- ──────────────────────────────────────────────────────────
-- PROFILES TABLE
-- ──────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type    TEXT NOT NULL CHECK (user_type IN ('lab', 'doctor')),
  full_name    TEXT NOT NULL,
  clinic_name  TEXT,
  role         TEXT CHECK (role IN ('technician', 'manager')),
  phone        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- ORDER NUMBER SEQUENCE
-- ──────────────────────────────────────────────────────────
CREATE SEQUENCE work_order_seq START 1;

-- ──────────────────────────────────────────────────────────
-- WORK ORDERS TABLE
-- ──────────────────────────────────────────────────────────
CREATE TABLE work_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number  TEXT NOT NULL UNIQUE,
  doctor_id     UUID NOT NULL REFERENCES profiles(id),
  assigned_to   UUID REFERENCES profiles(id),
  tooth_numbers INTEGER[] NOT NULL,
  work_type     TEXT NOT NULL,
  shade         TEXT,
  machine_type  machine_type NOT NULL,
  status        work_order_status NOT NULL DEFAULT 'alindi',
  notes         TEXT,
  delivery_date DATE NOT NULL,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- WORK ORDER PHOTOS TABLE
-- ──────────────────────────────────────────────────────────
CREATE TABLE work_order_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  storage_path   TEXT NOT NULL,
  uploaded_by    UUID NOT NULL REFERENCES profiles(id),
  caption        TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- STATUS HISTORY TABLE
-- ──────────────────────────────────────────────────────────
CREATE TABLE status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  changed_by     UUID NOT NULL REFERENCES profiles(id),
  old_status     work_order_status,
  new_status     work_order_status NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- TRIGGER FUNCTIONS
-- ──────────────────────────────────────────────────────────

-- Auto-create profile after auth.users INSERT
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, user_type, full_name, clinic_name, role, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'user_type',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'clinic_name',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'LAB-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('work_order_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ──────────────────────────────────────────────────────────
-- RPC: Atomic status update (work_orders + status_history)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_work_order_status(
  p_work_order_id UUID,
  p_new_status    work_order_status,
  p_changed_by    UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_old_status work_order_status;
BEGIN
  SELECT status INTO v_old_status FROM work_orders WHERE id = p_work_order_id;

  UPDATE work_orders
  SET
    status = p_new_status,
    delivered_at = CASE
      WHEN p_new_status = 'teslim_edildi' THEN NOW()
      ELSE delivered_at
    END
  WHERE id = p_work_order_id;

  INSERT INTO status_history (work_order_id, changed_by, old_status, new_status, note)
  VALUES (p_work_order_id, p_changed_by, v_old_status, p_new_status, p_note);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history  ENABLE ROW LEVEL SECURITY;

-- Helper function: is current user a lab user?
CREATE OR REPLACE FUNCTION is_lab_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND user_type = 'lab'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Own profile readable"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Lab users can read all profiles"
  ON profiles FOR SELECT
  USING (is_lab_user());

CREATE POLICY "Own profile updatable"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- WORK ORDERS policies
CREATE POLICY "Doctors see own orders"
  ON work_orders FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Lab users see all orders"
  ON work_orders FOR SELECT
  USING (is_lab_user());

CREATE POLICY "Doctors can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'doctor'
    )
  );

CREATE POLICY "Lab users can update orders"
  ON work_orders FOR UPDATE
  USING (is_lab_user());

-- WORK ORDER PHOTOS policies
CREATE POLICY "Photos: visible if order is accessible"
  ON work_order_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_id
        AND (wo.doctor_id = auth.uid() OR is_lab_user())
    )
  );

CREATE POLICY "Doctors upload photos for own orders"
  ON work_order_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM work_orders
      WHERE id = work_order_id AND doctor_id = auth.uid()
    )
  );

CREATE POLICY "Lab users can upload photos"
  ON work_order_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND is_lab_user()
  );

-- STATUS HISTORY policies
CREATE POLICY "Status history: visible if order is accessible"
  ON status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_id
        AND (wo.doctor_id = auth.uid() OR is_lab_user())
    )
  );

CREATE POLICY "Lab users can insert status history"
  ON status_history FOR INSERT
  WITH CHECK (changed_by = auth.uid() AND is_lab_user());

-- ──────────────────────────────────────────────────────────
-- STORAGE BUCKET (run in Supabase Dashboard or via CLI)
-- ──────────────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('work-order-photos', 'work-order-photos', false);
