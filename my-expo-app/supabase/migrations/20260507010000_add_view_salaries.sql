-- ============================================================
-- 20260507 — view_salaries izni eklendi
-- Maaş bilgilerini görüntüleme yetkisi (manage_salaries'ten ayrı)
-- ============================================================

INSERT INTO permissions (key, label, description, category, sort_order) VALUES
  ('view_salaries', 'Maaş Bilgisini Gör', 'Çalışan maaşlarını ve ödeme geçmişini görüntüleyebilir', 'section', 68)
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  sort_order  = EXCLUDED.sort_order;

-- Varsayılan: admin + lab_manager görsün, diğerleri görmesin
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('admin',       'view_salaries'),
  ('lab_manager', 'view_salaries')
ON CONFLICT DO NOTHING;
