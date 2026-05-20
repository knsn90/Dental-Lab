-- Fix: permissions + role_permissions tablolarında herkese açık RLS politikaları
-- USING (true) → sadece oturum açmış kullanıcılar okuyabilir

DROP POLICY IF EXISTS "permissions_read" ON permissions;
CREATE POLICY "permissions_read" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "role_permissions_read" ON role_permissions;
CREATE POLICY "role_permissions_read" ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');
