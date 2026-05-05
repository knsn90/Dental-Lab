-- ============================================================
-- Migration: Role-Based Access Control (RBAC) — Permissions
--
-- Creates a granular permission system on top of existing
-- user_type + role fields. Does NOT change profiles table.
--
-- Role keys map from existing fields:
--   admin          → 'admin'
--   lab + manager  → 'lab_manager'
--   lab + tech     → 'technician'
--   doctor         → 'doctor'
--   clinic_admin   → 'clinic_admin'
--   (future)       → 'courier'
-- ============================================================

-- ── 1. Permissions catalog ──────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'action'
    CHECK (category IN ('module','page','section','action')),
  sort_order  INT NOT NULL DEFAULT 0
);

-- ── 2. Role → Permission mapping ────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_key       TEXT NOT NULL,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_key);

-- ── 3. Enable RLS ───────────────────────────────────────────
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read permissions catalog (needed for admin UI)
DROP POLICY IF EXISTS "permissions_read" ON permissions;
CREATE POLICY "permissions_read" ON permissions
  FOR SELECT USING (true);

-- Everyone can read role_permissions (needed for can() checks)
DROP POLICY IF EXISTS "role_permissions_read" ON role_permissions;
CREATE POLICY "role_permissions_read" ON role_permissions
  FOR SELECT USING (true);

-- Only admins can modify
DROP POLICY IF EXISTS "permissions_admin_write" ON permissions;
CREATE POLICY "permissions_admin_write" ON permissions
  FOR ALL USING (my_user_type() = 'admin')
  WITH CHECK (my_user_type() = 'admin');

DROP POLICY IF EXISTS "role_permissions_admin_write" ON role_permissions;
CREATE POLICY "role_permissions_admin_write" ON role_permissions
  FOR ALL USING (my_user_type() = 'admin')
  WITH CHECK (my_user_type() = 'admin');

-- ── 4. Helper: resolve role_key from profiles ───────────────
CREATE OR REPLACE FUNCTION my_role_key()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p.user_type = 'admin'        THEN 'admin'
      WHEN p.user_type = 'lab' AND p.role = 'manager'    THEN 'lab_manager'
      WHEN p.user_type = 'lab' AND p.role = 'technician' THEN 'technician'
      WHEN p.user_type = 'lab'           THEN 'lab_manager' -- fallback for lab without role
      WHEN p.user_type = 'doctor'        THEN 'doctor'
      WHEN p.user_type = 'clinic_admin'  THEN 'clinic_admin'
      ELSE 'technician' -- safe fallback: least privilege
    END
  FROM profiles p
  WHERE p.id = auth.uid()
$$;

-- ── 5. Helper: check permission for current user ────────────
CREATE OR REPLACE FUNCTION has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_key = my_role_key()
      AND rp.permission_key = p_key
  )
$$;

-- ── 6. RPC: get all permissions for current user ────────────
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(rp.permission_key ORDER BY rp.permission_key),
    '{}'::TEXT[]
  )
  FROM role_permissions rp
  WHERE rp.role_key = my_role_key()
$$;

-- ── 7. RPC: get permissions for a specific role (admin UI) ──
CREATE OR REPLACE FUNCTION get_role_permissions(p_role TEXT)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(rp.permission_key ORDER BY rp.permission_key),
    '{}'::TEXT[]
  )
  FROM role_permissions rp
  WHERE rp.role_key = p_role
$$;

-- ── 8. RPC: set permissions for a role (admin only) ─────────
CREATE OR REPLACE FUNCTION set_role_permissions(
  p_role TEXT,
  p_permissions TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_user_type() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can modify permissions';
  END IF;

  -- Delete removed permissions
  DELETE FROM role_permissions
  WHERE role_key = p_role
    AND permission_key <> ALL(p_permissions);

  -- Insert new permissions (ignore existing)
  INSERT INTO role_permissions (role_key, permission_key)
  SELECT p_role, unnest(p_permissions)
  ON CONFLICT (role_key, permission_key) DO NOTHING;
END;
$$;

-- ── 9. Seed: Permission definitions ─────────────────────────
INSERT INTO permissions (key, label, description, category, sort_order) VALUES
  -- Orders
  ('view_orders',     'Siparisleri Gor',       'Siparis listesini goruntuleyebilir',     'module',  10),
  ('create_orders',   'Siparis Olustur',       'Yeni siparis olusturabilir',             'action',  11),
  ('edit_orders',     'Siparis Duzenle',       'Mevcut siparisleri duzenleyebilir',      'action',  12),
  ('assign_orders',   'Siparis Ata',           'Siparisleri teknisyene atayabilir',      'action',  13),
  -- Production
  ('view_production', 'Uretimi Gor',           'Uretim akisini goruntuleyebilir',        'module',  20),
  ('complete_stage',  'Asama Tamamla',         'Uretim asamalarini tamamlayabilir',      'action',  21),
  ('report_waste',    'Fire Bildir',           'Uretim firesi bildirebilir',             'action',  22),
  -- Finance
  ('view_financials', 'Mali Islemleri Gor',    'Fatura, gider, cek ve kasa modulleri',   'module',  30),
  ('view_cost',       'Maliyet Gor',           'Birim maliyet ve kar bilgilerini gor',   'section', 31),
  ('manage_finance',  'Mali Islem Yonet',      'Fatura, gider ve cek islemleri yapabilir','action', 32),
  -- Stock
  ('view_stock',      'Stok Gor',              'Stok listesini goruntuleyebilir',        'module',  40),
  ('manage_stock',    'Stok Yonet',            'Stok ekle, duzenle, hareket kaydet',     'action',  41),
  -- Design
  ('approve_design',  'Tasarim Onayla',        'Siparis tasarimini onaylayabilir',       'action',  50),
  -- Users
  ('manage_users',    'Kullanici Yonet',       'Kullanici ekle, duzenle, yetkilendir',  'action',  60),
  ('view_team',       'Ekibi Gor',             'Calisanlar ve performans bilgileri',     'module',  61),
  -- Delivery
  ('view_deliveries', 'Teslimatlari Gor',      'Teslimat listesini goruntuleyebilir',    'module',  70),
  ('mark_delivered',  'Teslim Edildi Isaretle', 'Teslimati tamamlandi olarak isaretle',  'action',  71),
  -- Settings
  ('view_settings',   'Ayarlari Gor',          'Sistem ayarlarini goruntuleyebilir',     'page',    80),
  ('manage_settings', 'Ayarlari Yonet',        'Sistem ayarlarini degistirebilir',       'action',  81),
  -- Approvals
  ('view_approvals',  'Onaylari Gor',          'Onay bekleyen islemleri goruntuleyebilir','module', 90),
  ('approve_orders',  'Siparis Onayla',        'Siparisleri onaylayabilir',              'action',  91)
ON CONFLICT (key) DO NOTHING;

-- ── 10. Seed: Default role permissions ──────────────────────

-- Admin: everything
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT DO NOTHING;

-- Lab Manager: most things except manage_settings
INSERT INTO role_permissions (role_key, permission_key)
VALUES
  ('lab_manager', 'view_orders'),
  ('lab_manager', 'create_orders'),
  ('lab_manager', 'edit_orders'),
  ('lab_manager', 'assign_orders'),
  ('lab_manager', 'view_production'),
  ('lab_manager', 'complete_stage'),
  ('lab_manager', 'report_waste'),
  ('lab_manager', 'view_financials'),
  ('lab_manager', 'view_cost'),
  ('lab_manager', 'manage_finance'),
  ('lab_manager', 'view_stock'),
  ('lab_manager', 'manage_stock'),
  ('lab_manager', 'approve_design'),
  ('lab_manager', 'manage_users'),
  ('lab_manager', 'view_team'),
  ('lab_manager', 'view_deliveries'),
  ('lab_manager', 'mark_delivered'),
  ('lab_manager', 'view_settings'),
  ('lab_manager', 'view_approvals'),
  ('lab_manager', 'approve_orders')
ON CONFLICT DO NOTHING;

-- Technician: production-focused
INSERT INTO role_permissions (role_key, permission_key)
VALUES
  ('technician', 'view_orders'),
  ('technician', 'view_production'),
  ('technician', 'complete_stage'),
  ('technician', 'report_waste'),
  ('technician', 'view_stock'),
  ('technician', 'view_team')
ON CONFLICT DO NOTHING;

-- Doctor: orders + approvals
INSERT INTO role_permissions (role_key, permission_key)
VALUES
  ('doctor', 'view_orders'),
  ('doctor', 'create_orders'),
  ('doctor', 'approve_design'),
  ('doctor', 'view_deliveries'),
  ('doctor', 'view_approvals'),
  ('doctor', 'approve_orders'),
  ('doctor', 'view_settings')
ON CONFLICT DO NOTHING;

-- Clinic Admin: clinic operations
INSERT INTO role_permissions (role_key, permission_key)
VALUES
  ('clinic_admin', 'view_orders'),
  ('clinic_admin', 'create_orders'),
  ('clinic_admin', 'edit_orders'),
  ('clinic_admin', 'approve_design'),
  ('clinic_admin', 'view_deliveries'),
  ('clinic_admin', 'view_approvals'),
  ('clinic_admin', 'approve_orders'),
  ('clinic_admin', 'manage_users'),
  ('clinic_admin', 'view_settings')
ON CONFLICT DO NOTHING;

-- Courier: delivery-focused
INSERT INTO role_permissions (role_key, permission_key)
VALUES
  ('courier', 'view_orders'),
  ('courier', 'view_deliveries'),
  ('courier', 'mark_delivered')
ON CONFLICT DO NOTHING;
