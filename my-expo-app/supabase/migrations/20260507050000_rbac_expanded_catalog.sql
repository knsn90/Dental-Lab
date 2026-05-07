-- ============================================================
-- 20260507 — RBAC genişletilmiş izin kataloğu
--
-- Mevcut 21 izine 29 yeni izin ekler (toplam 50). Eski izinler
-- korunur — geriye dönük uyumlu. Rol → izin haritaları yeniden
-- dağıtılır (idempotent INSERT/DELETE).
--
-- Kategoriler:
--   orders, production, design, approvals, finance, invoices,
--   expenses, checks, cash, pricelist, budget, stock, customers,
--   hr, delivery, communication, users, settings
-- ============================================================

-- ── 1. Yeni izinleri ekle (mevcutlar etkilenmez) ──────────
INSERT INTO permissions (key, label, description, category, sort_order) VALUES
  -- Orders (yeni: 3)
  ('cancel_orders',      'Sipariş İptal',          'Açık siparişi iptal edebilir',                'action',  14),
  ('delete_orders',      'Sipariş Sil',            'Siparişi kalıcı silebilir (admin)',           'action',  15),
  ('export_orders',      'Siparişleri Dışa Aktar', 'Sipariş listesini CSV/PDF olarak indirir',    'action',  16),

  -- Production (yeni: 3)
  ('start_stage',        'Aşama Başlat',           'Üretim aşamasını başlatabilir',               'action',  23),
  ('override_stage',     'Aşama Override',         'Aşama geçişini sırayı bozarak yapabilir',     'action',  24),
  ('manage_qc',          'Kalite Kontrol',         'KK kontrol kayıtlarını yönetebilir',          'action',  25),

  -- Design (yeni: 2 — approve_design zaten var)
  ('view_design',        'Tasarımları Gör',        'Tasarım listesini görüntüleyebilir',          'module',  51),
  ('upload_design',      'Tasarım Yükle',          'STL/PLY/JPG tasarım dosyası ekleyebilir',     'action',  52),

  -- Approvals (yeni: 2 — view_approvals + approve_orders zaten var)
  ('reject_orders',      'Sipariş Reddet',         'Onay bekleyen siparişi reddedebilir',         'action',  92),
  ('approve_messages',   'Mesaj Onayla',           'Teknisyen mesajlarını onaylayabilir',         'action',  93),

  -- Finance — global (yeni: 1)
  ('export_reports',     'Rapor Dışa Aktar',       'Finansal raporları CSV/PDF indirir',          'action',  33),

  -- Invoices (yeni: 5)
  ('view_invoices',      'Faturaları Gör',         'Fatura listesini görüntüler',                 'module', 100),
  ('manage_invoices',    'Fatura Yönet',           'Fatura oluştur, düzenle',                     'action', 101),
  ('void_invoices',      'Fatura İptal',           'Faturayı iptal edebilir',                     'action', 102),
  ('send_einvoice',      'E-Fatura Gönder',        'E-fatura sistemine gönderir',                 'action', 103),
  ('record_payment',     'Ödeme Kaydet',           'Faturaya ödeme/tahsilat kaydeder',            'action', 104),

  -- Expenses / Checks / Cash (yeni: 3)
  ('manage_expenses',    'Gider Yönet',            'Gider ekle, düzenle, sil',                    'action', 110),
  ('manage_checks',      'Çek/Senet Yönet',        'Çek/senet kayıtlarını yönetir',               'action', 111),
  ('manage_cash',        'Kasa/Banka Yönet',       'Kasa hareketleri yönetir',                    'action', 112),

  -- Pricelist / Budget (yeni: 2)
  ('manage_pricelist',   'Fiyat Listesi Yönet',    'Hizmet fiyatlarını ekler/günceller',          'action', 120),
  ('manage_budget',      'Bütçe Yönet',            'Bütçe planlama ve takibi',                    'action', 121),

  -- Stock (yeni: 2)
  ('create_stock_movement','Stok Hareketi Kaydet', 'Alış/çıkış kaydı oluşturur',                  'action',  42),
  ('count_stock',        'Stok Sayım',             'Sayım kaydı yapar',                           'action',  43),

  -- Customers (yeni: 2)
  ('view_customers',     'Müşterileri Gör',        'Klinik ve hekim listesini görüntüler',        'module',  62),
  ('manage_customers',   'Müşteri Yönet',          'Klinik ve hekim ekle/düzenle/sil',            'action',  63),

  -- HR / Employees (yeni: 4)
  ('manage_employees',   'Çalışan Yönet',          'Çalışan ekle, düzenle, pasife al',            'action',  64),
  ('manage_salaries',    'Maaş & Avans Yönet',     'Maaş öde, avans ver',                         'action',  65),
  ('manage_attendance',  'Devam & İzin Yönet',     'Yoklama, izin onaylar',                       'action',  66),
  ('view_performance',   'Performans Gör',         'Teknisyen performans raporları',              'module',  67),

  -- Delivery (yeni: 1)
  ('manage_couriers',    'Kurye Yönet',            'Kurye ekle, ata, takip et',                   'action',  72),

  -- Communication (yeni: 1)
  ('send_messages',      'Mesaj Gönder',           'Sipariş mesajlaşmasında mesaj gönderir',      'action',  85),

  -- Permissions (yeni: 1 — admin-only)
  ('manage_permissions', 'Yetki Yönet',            'Rol → izin matrisini düzenler (admin)',       'action',  82),

  -- Integrations (yeni: 1)
  ('manage_integrations','Entegrasyon Yönet',      'E-fatura, 3. parti entegrasyonlar',           'action',  83)

ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  sort_order  = EXCLUDED.sort_order;

-- ── 2. Rol → izin haritalarını sıfırla ve yeniden seed et ─
-- Eski mappings bozulmasın diye sadece bu rollere ait satırları temizle
DELETE FROM role_permissions WHERE role_key IN ('admin','lab_manager','technician','doctor','clinic_admin','courier');

-- ── ADMIN: tüm izinler ────────────────────────────────────
INSERT INTO role_permissions (role_key, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT DO NOTHING;

-- ── LAB MANAGER: ~38 izin (admin-only olanlar hariç) ───────
INSERT INTO role_permissions (role_key, permission_key) VALUES
  -- Orders (delete + override hariç)
  ('lab_manager','view_orders'),('lab_manager','create_orders'),('lab_manager','edit_orders'),
  ('lab_manager','assign_orders'),('lab_manager','cancel_orders'),('lab_manager','export_orders'),
  -- Production (override hariç)
  ('lab_manager','view_production'),('lab_manager','start_stage'),('lab_manager','complete_stage'),
  ('lab_manager','report_waste'),('lab_manager','manage_qc'),
  -- Design
  ('lab_manager','view_design'),('lab_manager','upload_design'),('lab_manager','approve_design'),
  -- Approvals
  ('lab_manager','view_approvals'),('lab_manager','approve_orders'),('lab_manager','reject_orders'),
  ('lab_manager','approve_messages'),
  -- Finance
  ('lab_manager','view_financials'),('lab_manager','view_cost'),('lab_manager','manage_finance'),
  ('lab_manager','export_reports'),
  -- Invoices (void hariç)
  ('lab_manager','view_invoices'),('lab_manager','manage_invoices'),('lab_manager','send_einvoice'),
  ('lab_manager','record_payment'),
  -- Expenses/Checks/Cash
  ('lab_manager','manage_expenses'),('lab_manager','manage_checks'),('lab_manager','manage_cash'),
  -- Pricelist/Budget
  ('lab_manager','manage_pricelist'),('lab_manager','manage_budget'),
  -- Stock
  ('lab_manager','view_stock'),('lab_manager','manage_stock'),('lab_manager','create_stock_movement'),
  ('lab_manager','count_stock'),
  -- Customers
  ('lab_manager','view_customers'),('lab_manager','manage_customers'),
  -- HR
  ('lab_manager','view_team'),('lab_manager','manage_employees'),('lab_manager','manage_salaries'),
  ('lab_manager','manage_attendance'),('lab_manager','view_performance'),
  -- Delivery
  ('lab_manager','view_deliveries'),('lab_manager','mark_delivered'),('lab_manager','manage_couriers'),
  -- Communication
  ('lab_manager','send_messages'),
  -- Users (manage_permissions hariç)
  ('lab_manager','manage_users'),
  -- Settings (manage hariç — sadece view)
  ('lab_manager','view_settings')
ON CONFLICT DO NOTHING;

-- ── TECHNICIAN: 9 izin (üretim odaklı) ────────────────────
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('technician','view_orders'),
  ('technician','view_production'),('technician','start_stage'),
  ('technician','complete_stage'),('technician','report_waste'),
  ('technician','view_design'),
  ('technician','view_stock'),
  ('technician','view_team'),
  ('technician','send_messages')
ON CONFLICT DO NOTHING;

-- ── DOCTOR: 11 izin (sipariş açma + onay) ─────────────────
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('doctor','view_orders'),('doctor','create_orders'),
  ('doctor','view_design'),('doctor','upload_design'),('doctor','approve_design'),
  ('doctor','view_approvals'),('doctor','approve_orders'),
  ('doctor','view_deliveries'),
  ('doctor','send_messages'),
  ('doctor','record_payment'),
  ('doctor','view_settings')
ON CONFLICT DO NOTHING;

-- ── CLINIC ADMIN: 14 izin (klinik operasyonları) ───────────
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('clinic_admin','view_orders'),('clinic_admin','create_orders'),('clinic_admin','edit_orders'),
  ('clinic_admin','view_design'),('clinic_admin','approve_design'),
  ('clinic_admin','view_approvals'),('clinic_admin','approve_orders'),
  ('clinic_admin','view_deliveries'),
  ('clinic_admin','manage_customers'),
  ('clinic_admin','view_invoices'),('clinic_admin','record_payment'),
  ('clinic_admin','manage_users'),
  ('clinic_admin','send_messages'),
  ('clinic_admin','view_settings')
ON CONFLICT DO NOTHING;

-- ── COURIER: 5 izin (teslimat odaklı) ─────────────────────
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('courier','view_orders'),
  ('courier','view_deliveries'),('courier','mark_delivered'),
  ('courier','view_team'),
  ('courier','send_messages')
ON CONFLICT DO NOTHING;

-- ── 3. Doğrulama ───────────────────────────────────────────
-- SELECT role_key, COUNT(*) AS perm_count
-- FROM role_permissions GROUP BY role_key ORDER BY role_key;
-- Beklenen:
--   admin        → 50
--   lab_manager  → 47
--   technician   →  9
--   doctor       → 11
--   clinic_admin → 14
--   courier      →  5
