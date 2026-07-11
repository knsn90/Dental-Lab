-- Yeni izinler:
--   manage_order_create  → Yeni sipariş oluşturma (artık manage_orders'tan ayrı)
--   view_order_pricing   → Yeni sipariş ekranında fiyat görme (lab/istasyon için)
--
-- Varsayılan grant'lar: Müdür + Klinik (admin) + Hekim sipariş açabilir.
-- (admin user_type uygulama tarafında zaten TÜM izinleri alır; teknisyen almaz.)
-- view_order_pricing varsayılan kimseye verilmez — admin yetkiler sayfasından dağıtır.
-- (admin/klinik/hekim panelleri fiyatı zaten panel-bazlı her zaman görür.)

INSERT INTO permissions (key, label, description, category, sort_order) VALUES
  ('manage_order_create', 'Yeni Sipariş Oluştur',        'Yeni iş emri / sipariş oluşturma yetkisi',       'action', 12),
  ('view_order_pricing',  'Sipariş Fiyatlarını Görme',   'Yeni sipariş ekranında fiyat bilgisini görme',   'action', 13)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('lab_manager',  'manage_order_create'),
  ('doctor',       'manage_order_create'),
  ('clinic_admin', 'manage_order_create')
ON CONFLICT (role_key, permission_key) DO NOTHING;
