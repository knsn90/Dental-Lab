/**
 * Permission Store — RBAC permission state + `can()` helper
 *
 * Fetches permissions from Supabase RPC `get_my_permissions()`
 * and provides a fast `can(key)` lookup.
 *
 * Role mapping (in DB):
 *   admin           → 'admin'
 *   lab + manager   → 'lab_manager'
 *   lab + technician→ 'technician'
 *   doctor          → 'doctor'
 *   clinic_admin    → 'clinic_admin'
 *   (future)        → 'courier'
 */
import { create } from 'zustand';
import { supabase } from '../api/supabase';

// ─── All permission keys (keep in sync with migration) ──────
export type PermissionKey =
  // Orders
  | 'view_orders'
  | 'create_orders'
  | 'edit_orders'
  | 'assign_orders'
  | 'cancel_orders'
  | 'delete_orders'
  | 'export_orders'
  // Production
  | 'view_production'
  | 'start_stage'
  | 'complete_stage'
  | 'report_waste'
  | 'override_stage'
  | 'manage_qc'
  // Design
  | 'view_design'
  | 'upload_design'
  | 'approve_design'
  // Approvals
  | 'view_approvals'
  | 'approve_orders'
  | 'reject_orders'
  | 'approve_messages'
  // Finance
  | 'view_financials'
  | 'view_cost'
  | 'manage_finance'
  | 'export_reports'
  // Invoices
  | 'view_invoices'
  | 'manage_invoices'
  | 'void_invoices'
  | 'send_einvoice'
  | 'record_payment'
  // Expenses/Checks/Cash
  | 'manage_expenses'
  | 'manage_checks'
  | 'manage_cash'
  // Pricelist/Budget
  | 'manage_pricelist'
  | 'manage_budget'
  // Stock
  | 'view_stock'
  | 'manage_stock'
  | 'create_stock_movement'
  | 'count_stock'
  // Customers
  | 'view_customers'
  | 'manage_customers'
  // HR / Employees
  | 'view_team'
  | 'manage_employees'
  | 'view_salaries'
  | 'manage_salaries'
  | 'manage_attendance'
  | 'view_performance'
  // Delivery
  | 'view_deliveries'
  | 'mark_delivered'
  | 'manage_couriers'
  // Communication
  | 'send_messages'
  // Users / Roles
  | 'manage_users'
  | 'manage_permissions'
  // Settings
  | 'view_settings'
  | 'manage_settings'
  | 'manage_integrations';

// ─── Role keys ──────────────────────────────────────────────
export type RoleKey =
  | 'admin'
  | 'lab_manager'
  | 'technician'
  | 'doctor'
  | 'clinic_admin'
  | 'courier';

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin:        'Admin',
  lab_manager:  'Lab Yoneticisi',
  technician:   'Teknisyen',
  doctor:       'Hekim',
  clinic_admin: 'Klinik Yoneticisi',
  courier:      'Kurye',
};

// ─── Permission category labels ─────────────────────────────
export const PERMISSION_CATEGORIES: Record<string, string> = {
  orders:        'Siparişler',
  production:    'Üretim',
  design:        'Tasarım',
  approvals:     'Onaylar',
  finance:       'Mali İşlemler',
  invoices:      'Faturalar',
  cashflow:      'Gider · Çek · Kasa',
  pricing:       'Fiyat & Bütçe',
  stock:         'Stok & Depo',
  customers:     'Müşteriler',
  hr:            'Ekip & İK',
  delivery:      'Teslimat',
  communication: 'İletişim',
  users:         'Kullanıcı Yönetimi',
  settings:      'Ayarlar',
};

// ─── Group permissions by category ──────────────────────────
export const PERMISSION_GROUPS: { category: string; keys: PermissionKey[] }[] = [
  { category: 'orders',        keys: ['view_orders', 'create_orders', 'edit_orders', 'assign_orders', 'cancel_orders', 'delete_orders', 'export_orders'] },
  { category: 'production',    keys: ['view_production', 'start_stage', 'complete_stage', 'report_waste', 'override_stage', 'manage_qc'] },
  { category: 'design',        keys: ['view_design', 'upload_design', 'approve_design'] },
  { category: 'approvals',     keys: ['view_approvals', 'approve_orders', 'reject_orders', 'approve_messages'] },
  { category: 'finance',       keys: ['view_financials', 'view_cost', 'manage_finance', 'export_reports'] },
  { category: 'invoices',      keys: ['view_invoices', 'manage_invoices', 'void_invoices', 'send_einvoice', 'record_payment'] },
  { category: 'cashflow',      keys: ['manage_expenses', 'manage_checks', 'manage_cash'] },
  { category: 'pricing',       keys: ['manage_pricelist', 'manage_budget'] },
  { category: 'stock',         keys: ['view_stock', 'manage_stock', 'create_stock_movement', 'count_stock'] },
  { category: 'customers',     keys: ['view_customers', 'manage_customers'] },
  { category: 'hr',            keys: ['view_team', 'manage_employees', 'view_salaries', 'manage_salaries', 'manage_attendance', 'view_performance'] },
  { category: 'delivery',      keys: ['view_deliveries', 'mark_delivered', 'manage_couriers'] },
  { category: 'communication', keys: ['send_messages'] },
  { category: 'users',         keys: ['manage_users', 'manage_permissions'] },
  { category: 'settings',      keys: ['view_settings', 'manage_settings', 'manage_integrations'] },
];

// ─── Permission labels (fallback if DB not loaded) ──────────
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  // Orders
  view_orders:           'Siparişleri Gör',
  create_orders:         'Sipariş Oluştur',
  edit_orders:           'Sipariş Düzenle',
  assign_orders:         'Sipariş Ata',
  cancel_orders:         'Sipariş İptal',
  delete_orders:         'Sipariş Sil',
  export_orders:         'Siparişleri Dışa Aktar',
  // Production
  view_production:       'Üretimi Gör',
  start_stage:           'Aşama Başlat',
  complete_stage:        'Aşama Tamamla',
  report_waste:          'Fire Bildir',
  override_stage:        'Aşama Override',
  manage_qc:             'Kalite Kontrol',
  // Design
  view_design:           'Tasarımları Gör',
  upload_design:         'Tasarım Yükle',
  approve_design:        'Tasarım Onayla',
  // Approvals
  view_approvals:        'Onayları Gör',
  approve_orders:        'Sipariş Onayla',
  reject_orders:         'Sipariş Reddet',
  approve_messages:      'Mesaj Onayla',
  // Finance
  view_financials:       'Mali İşlemleri Gör',
  view_cost:             'Maliyet Gör',
  manage_finance:        'Mali İşlem Yönet',
  export_reports:        'Rapor Dışa Aktar',
  // Invoices
  view_invoices:         'Faturaları Gör',
  manage_invoices:       'Fatura Yönet',
  void_invoices:         'Fatura İptal',
  send_einvoice:         'E-Fatura Gönder',
  record_payment:        'Ödeme Kaydet',
  // Expenses/Checks/Cash
  manage_expenses:       'Gider Yönet',
  manage_checks:         'Çek/Senet Yönet',
  manage_cash:           'Kasa/Banka Yönet',
  // Pricelist/Budget
  manage_pricelist:      'Fiyat Listesi Yönet',
  manage_budget:         'Bütçe Yönet',
  // Stock
  view_stock:            'Stok Gör',
  manage_stock:          'Stok Yönet',
  create_stock_movement: 'Stok Hareketi Kaydet',
  count_stock:           'Stok Sayım',
  // Customers
  view_customers:        'Müşterileri Gör',
  manage_customers:      'Müşteri Yönet',
  // HR
  view_team:             'Ekibi Gör',
  manage_employees:      'Çalışan Yönet',
  view_salaries:         'Maaş Bilgisini Gör',
  manage_salaries:       'Maaş & Avans Yönet',
  manage_attendance:     'Devam & İzin Yönet',
  view_performance:      'Performans Gör',
  // Delivery
  view_deliveries:       'Teslimatları Gör',
  mark_delivered:        'Teslim Edildi İşaretle',
  manage_couriers:       'Kurye Yönet',
  // Communication
  send_messages:         'Mesaj Gönder',
  // Users / Roles
  manage_users:          'Kullanıcı Yönet',
  manage_permissions:    'Yetki Yönet',
  // Settings
  view_settings:         'Ayarları Gör',
  manage_settings:       'Ayarları Yönet',
  manage_integrations:   'Entegrasyon Yönet',
};

// ─── All permissions (fallback when RPC doesn't exist yet) ──
const ALL_PERMISSIONS = new Set<string>([
  // Orders
  'view_orders','create_orders','edit_orders','assign_orders','cancel_orders','delete_orders','export_orders',
  // Production
  'view_production','start_stage','complete_stage','report_waste','override_stage','manage_qc',
  // Design
  'view_design','upload_design','approve_design',
  // Approvals
  'view_approvals','approve_orders','reject_orders','approve_messages',
  // Finance
  'view_financials','view_cost','manage_finance','export_reports',
  // Invoices
  'view_invoices','manage_invoices','void_invoices','send_einvoice','record_payment',
  // Expenses/Checks/Cash
  'manage_expenses','manage_checks','manage_cash',
  // Pricelist/Budget
  'manage_pricelist','manage_budget',
  // Stock
  'view_stock','manage_stock','create_stock_movement','count_stock',
  // Customers
  'view_customers','manage_customers',
  // HR
  'view_team','manage_employees','view_salaries','manage_salaries','manage_attendance','view_performance',
  // Delivery
  'view_deliveries','mark_delivered','manage_couriers',
  // Communication
  'send_messages',
  // Users / Roles
  'manage_users','manage_permissions',
  // Settings
  'view_settings','manage_settings','manage_integrations',
]);

// ─── Panel → role key mapping ───────────────────────────────
// When admin views a different panel, use that panel's role
const PANEL_ROLE_MAP: Record<string, RoleKey> = {
  lab:    'lab_manager',
  admin:  'admin',
  doctor: 'doctor',
  clinic: 'clinic_admin',
};

// ─── Store ──────────────────────────────────────────────────

interface PermissionState {
  permissions: Set<string>;
  loaded: boolean;
  loading: boolean;
  /** Current panel the permissions are loaded for */
  activePanel: string | null;

  /** Check if current user has a specific permission */
  can: (key: PermissionKey) => boolean;

  /** Check if current user has ANY of the given permissions */
  canAny: (...keys: PermissionKey[]) => boolean;

  /** Check if current user has ALL of the given permissions */
  canAll: (...keys: PermissionKey[]) => boolean;

  /** Fetch permissions for current user (uses get_my_permissions) */
  fetchPermissions: () => Promise<void>;

  /**
   * Fetch permissions for a specific panel.
   * If user is admin viewing lab panel → fetches lab_manager perms.
   * If user's own role matches the panel → fetches own perms.
   */
  fetchForPanel: (panel: string, userType?: string) => Promise<void>;

  /** Force next fetchForPanel to re-fetch (e.g. when tab regains focus) */
  invalidate: () => void;

  /** Clear on logout */
  clear: () => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: new Set<string>(),
  loaded: false,
  loading: false,
  activePanel: null,

  can: (key) => get().permissions.has(key),

  canAny: (...keys) => keys.some(k => get().permissions.has(k)),

  canAll: (...keys) => keys.every(k => get().permissions.has(k)),

  fetchPermissions: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      // Admin kontrolu: profilde admin ise direkt tum izinleri ver
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', user.id)
          .maybeSingle();
        if (prof?.user_type === 'admin') {
          set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
          return;
        }
      }

      const { data, error } = await supabase.rpc('get_my_permissions');
      if (!error && Array.isArray(data)) {
        // Boş array → kullanıcının izni yok (admin olmayan için doğru davranış)
        set({ permissions: new Set(data as string[]), loaded: true });
      } else {
        // RPC mevcut değil veya hata → güvenli taraf: izin verme
        // (Eski davranış: ALL_PERMISSIONS — bu bug idi, lab_manager admin gibi davranıyordu)
        console.warn('[permissions] get_my_permissions failed', error?.message);
        set({ permissions: new Set(), loaded: true });
      }
    } catch (e: any) {
      console.warn('[permissions] fetch error', e?.message);
      set({ permissions: new Set(), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  fetchForPanel: async (panel: string, userType?: string) => {
    const roleKey = PANEL_ROLE_MAP[panel];
    if (!roleKey) {
      // Unknown panel — fetch own permissions
      return get().fetchPermissions();
    }

    // ── Admin: her şeyi gor ─────────────────────────────────
    // Admin kendi panelinde (admin) iken tum izinleri verir.
    // userType henuz gelmediyse profilden tekrar bak — timing problemini onler.
    let resolvedUserType = userType;
    if (!resolvedUserType) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', user.id)
            .maybeSingle();
          resolvedUserType = prof?.user_type as string | undefined;
        }
      } catch {}
    }

    if (resolvedUserType === 'admin' && panel === 'admin') {
      set({ permissions: new Set(ALL_PERMISSIONS), loaded: true, activePanel: panel, loading: false });
      return;
    }

    // If user is admin viewing a different panel, fetch that panel's role perms
    const isAdmin = resolvedUserType === 'admin';
    const targetRole = isAdmin && panel !== 'admin' ? roleKey : null;

    // Skip if already loaded for this panel — AMA admin ise her zaman re-evaluate et
    if (!isAdmin && get().activePanel === panel && get().loaded) return;

    set({ loading: true, activePanel: panel });
    try {
      let data: any;
      let error: any;

      if (targetRole) {
        // Admin viewing another panel → get that role's permissions
        ({ data, error } = await supabase.rpc('get_role_permissions', { p_role: targetRole }));
      } else {
        // Normal user → get own permissions
        ({ data, error } = await supabase.rpc('get_my_permissions'));
      }

      if (!error && Array.isArray(data)) {
        // RPC başarılı — array'i kullan (boş bile olsa)
        set({ permissions: new Set(data as string[]), loaded: true });
      } else if (isAdmin) {
        // Admin için RPC başarısızsa fallback ALL — admin her zaman tam yetkili
        set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
      } else {
        // Non-admin için RPC başarısız → boş set (güvenli taraf)
        console.warn('[permissions] RPC failed for non-admin', error?.message);
        set({ permissions: new Set(), loaded: true });
      }
    } catch (e: any) {
      // Catch içinde admin/non-admin ayrımı koru
      if (isAdmin) {
        set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
      } else {
        console.warn('[permissions] fetchForPanel error', e?.message);
        set({ permissions: new Set(), loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ activePanel: null, loaded: false }),

  clear: () => set({ permissions: new Set(), loaded: false, loading: false, activePanel: null }),
}));
