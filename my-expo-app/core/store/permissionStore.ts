/**
 * Permission Store — RBAC permission state + `can()` helper
 *
 * Yeni model (v2): her özellik için **view/manage çifti**.
 *   `view_<feature>`   → görme (liste/sayfa açma)
 *   `manage_<feature>` → ekle/düzenle/sil aksiyonları
 *
 * Bazı özelliklerde sadece view veya sadece manage olur (örn. logs sadece
 * view, integrations sadece manage). Bu özellikler `hasView`/`hasManage`
 * flag'leriyle FEATURES içinde belirtilir.
 *
 * Eski (legacy) key'ler `LEGACY_ALIAS` ile yeni key'lere maplenir. `can()`
 * çift yönlü kontrol yapar: eski kod yeni key sorabilir, yeni kod eski
 * key sorabilir. Migration tamamlanınca alias kaldırılır.
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

// ─── Feature catalog (single source of truth) ────────────────
export type FeatureKey =
  // Operations
  | 'orders'           | 'production'   | 'design'         | 'approvals'
  | 'order_create'     | 'order_pricing'
  | 'deliveries'       | 'couriers'
  // Customers
  | 'customers'
  // Finance
  | 'finance'          | 'cost'         | 'profit'
  | 'invoices'         | 'purchase_invoices'
  | 'expenses'         | 'checks'       | 'cash'
  | 'pricelist'        | 'budget'
  | 'clinic_balance'   | 'supplier_balance'
  // Stock
  | 'stock'
  | 'stock_movements'
  | 'stock_cost'
  | 'stock_locations'
  | 'stock_settings'
  | 'stock_forecast'
  | 'suppliers'
  | 'equipment'
  // HR
  | 'employees'        | 'attendance'   | 'leaves'
  | 'salaries'         | 'performance'  | 'employee_documents'
  // Lab catalog
  | 'services'
  // Communication
  | 'messages'         | 'support'
  // Documents
  | 'documents'
  // System
  | 'users'            | 'permissions'  | 'settings'       | 'integrations'
  | 'logs'             | 'analytics'
  // Production specifics
  | 'qc'               | 'waste'        | 'stages';

interface FeatureDef {
  key: FeatureKey;
  category: CategoryKey;
  label: string;
  /** view_<key> permission var mı? false → görme manage'a bağlı (manage_only) */
  hasView: boolean;
  /** manage_<key> permission var mı? false → sadece okuma (view_only) */
  hasManage: boolean;
}

export type CategoryKey =
  | 'orders' | 'production' | 'finance' | 'invoices'
  | 'cashflow' | 'pricing' | 'stock' | 'customers'
  | 'hr' | 'delivery' | 'communication' | 'users' | 'settings';

export const PERMISSION_CATEGORIES: Record<CategoryKey, string> = {
  orders:        'Siparişler',
  production:    'Üretim & Tasarım',
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

export const FEATURES: FeatureDef[] = [
  // Orders
  { key: 'orders',           category: 'orders',       label: 'Siparişler',         hasView: true,  hasManage: true  },
  { key: 'order_create',     category: 'orders',       label: 'Yeni Sipariş Oluştur', hasView: false, hasManage: true  },
  { key: 'order_pricing',    category: 'orders',       label: 'Sipariş Fiyatları (görme)', hasView: true, hasManage: false },
  { key: 'approvals',        category: 'orders',       label: 'Onaylar',            hasView: true,  hasManage: true  },
  // Production / Design
  { key: 'production',       category: 'production',   label: 'Üretim',             hasView: true,  hasManage: true  },
  { key: 'design',           category: 'production',   label: 'Tasarım',            hasView: true,  hasManage: true  },
  // Customers
  { key: 'customers',        category: 'customers',    label: 'Müşteriler',         hasView: true,  hasManage: true  },
  // Finance
  { key: 'finance',          category: 'finance',      label: 'Mali Özet',          hasView: true,  hasManage: true  },
  { key: 'cost',             category: 'finance',      label: 'Maliyet',            hasView: true,  hasManage: false },
  { key: 'profit',           category: 'finance',      label: 'Karlılık',           hasView: true,  hasManage: false },
  { key: 'clinic_balance',   category: 'finance',      label: 'Klinik Bakiyesi',    hasView: true,  hasManage: false },
  { key: 'supplier_balance', category: 'finance',      label: 'Tedarikçi Bakiyesi', hasView: true,  hasManage: false },
  // Invoices
  { key: 'invoices',         category: 'invoices',     label: 'Satış Faturaları',   hasView: true,  hasManage: true  },
  { key: 'purchase_invoices',category: 'invoices',     label: 'Alış Faturaları',    hasView: true,  hasManage: true  },
  // Cashflow
  { key: 'expenses',         category: 'cashflow',     label: 'Giderler',           hasView: true,  hasManage: true  },
  { key: 'checks',           category: 'cashflow',     label: 'Çek & Senet',        hasView: true,  hasManage: true  },
  { key: 'cash',             category: 'cashflow',     label: 'Kasa & Banka',       hasView: true,  hasManage: true  },
  // Pricing
  { key: 'pricelist',        category: 'pricing',      label: 'Fiyat Listesi',      hasView: true,  hasManage: true  },
  { key: 'budget',           category: 'pricing',      label: 'Bütçe',              hasView: true,  hasManage: true  },
  // Production detayları
  { key: 'qc',               category: 'production',   label: 'Kalite Kontrol',     hasView: true,  hasManage: true  },
  { key: 'waste',            category: 'production',   label: 'Fire Bildirimi',     hasView: true,  hasManage: true  },
  { key: 'stages',           category: 'production',   label: 'İstasyonlar',        hasView: true,  hasManage: true  },
  // Stock
  { key: 'stock',            category: 'stock',        label: 'Stok Ürünleri',      hasView: true,  hasManage: true  },
  { key: 'stock_movements',  category: 'stock',        label: 'Stok Hareketleri',   hasView: true,  hasManage: true  },
  { key: 'stock_cost',       category: 'stock',        label: 'Stok Maliyet',       hasView: true,  hasManage: true  },
  { key: 'stock_locations',  category: 'stock',        label: 'Stok Lokasyon',      hasView: true,  hasManage: true  },
  { key: 'stock_settings',   category: 'stock',        label: 'Stok Ayarları',      hasView: true,  hasManage: true  },
  { key: 'stock_forecast',   category: 'stock',        label: 'Stok Tahmin',        hasView: true,  hasManage: false },
  { key: 'suppliers',        category: 'stock',        label: 'Tedarikçiler',       hasView: true,  hasManage: true  },
  { key: 'equipment',        category: 'stock',        label: 'Demirbaş',           hasView: true,  hasManage: true  },
  // Lab Services
  { key: 'services',         category: 'pricing',      label: 'Hizmet Kataloğu',    hasView: true,  hasManage: true  },
  // HR
  { key: 'employees',        category: 'hr',           label: 'Personel',           hasView: true,  hasManage: true  },
  { key: 'attendance',       category: 'hr',           label: 'Devam',              hasView: true,  hasManage: true  },
  { key: 'leaves',           category: 'hr',           label: 'İzinler',            hasView: true,  hasManage: true  },
  { key: 'salaries',         category: 'hr',           label: 'Maaş & Avans',       hasView: true,  hasManage: true  },
  { key: 'performance',      category: 'hr',           label: 'Performans',         hasView: true,  hasManage: false },
  { key: 'employee_documents', category: 'hr',         label: 'Personel Belgeleri', hasView: true,  hasManage: true  },
  // Delivery
  { key: 'deliveries',       category: 'delivery',     label: 'Teslimatlar',        hasView: true,  hasManage: true  },
  { key: 'couriers',         category: 'delivery',     label: 'Kuryeler',           hasView: true,  hasManage: true  },
  // Communication
  { key: 'messages',         category: 'communication',label: 'Mesajlar',           hasView: true,  hasManage: true  },
  { key: 'support',          category: 'communication',label: 'Destek Talepleri',   hasView: true,  hasManage: true  },
  // Documents
  { key: 'documents',        category: 'settings',     label: 'Dosya Arşivi',       hasView: true,  hasManage: true  },
  // System
  { key: 'users',            category: 'users',        label: 'Kullanıcılar',       hasView: true,  hasManage: true  },
  { key: 'permissions',      category: 'users',        label: 'Yetkiler',           hasView: false, hasManage: true  },
  { key: 'settings',         category: 'settings',     label: 'Genel Ayarlar',      hasView: true,  hasManage: true  },
  { key: 'integrations',     category: 'settings',     label: 'Entegrasyonlar',     hasView: false, hasManage: true  },
  { key: 'logs',             category: 'settings',     label: 'Sistem Logları',     hasView: true,  hasManage: false },
  { key: 'analytics',        category: 'settings',     label: 'Analitik & Rapor',   hasView: true,  hasManage: false },
];

// ─── Build new permission key list from FEATURES ─────────────
const NEW_KEYS: string[] = [];
for (const f of FEATURES) {
  if (f.hasView)   NEW_KEYS.push(`view_${f.key}`);
  if (f.hasManage) NEW_KEYS.push(`manage_${f.key}`);
}

// ─── Legacy → new key alias (read-side bidirectional) ────────
// Sol taraf: eski key — DB'de hâlâ olabilir veya kod hâlâ sorabilir
// Sağ taraf: yeni karşılığı
const LEGACY_ALIAS: Record<string, string> = {
  // Orders — granular legacy → manage_orders
  create_orders:           'manage_orders',
  edit_orders:             'manage_orders',
  assign_orders:           'manage_orders',
  cancel_orders:           'manage_orders',
  delete_orders:           'manage_orders',
  export_orders:           'manage_orders',
  // Production
  start_stage:             'manage_stages',
  complete_stage:          'manage_stages',
  report_waste:            'manage_waste',
  override_stage:          'manage_stages',
  manage_qc:               'manage_qc',
  view_production:         'view_production',
  // Design
  view_design:             'view_design',
  upload_design:           'manage_design',
  approve_design:          'manage_design',
  // Approvals
  view_approvals:          'view_approvals',
  approve_orders:          'manage_approvals',
  reject_orders:           'manage_approvals',
  approve_messages:        'manage_approvals',
  // Finance
  view_financials:         'view_finance',
  manage_finance:          'manage_finance',
  view_cost:               'view_cost',
  view_profit:             'view_profit',
  view_clinic_balance:     'view_clinic_balance',
  view_supplier_balance:   'view_supplier_balance',
  export_reports:          'view_analytics',
  export_finance:          'view_finance',
  // Invoices
  view_invoices:           'view_invoices',
  manage_invoices:         'manage_invoices',
  void_invoices:           'manage_invoices',
  send_einvoice:           'manage_invoices',
  record_payment:          'manage_invoices',
  approve_invoice:         'manage_invoices',
  delete_invoice:          'manage_invoices',
  view_purchase_invoices:  'view_purchase_invoices',
  manage_purchase_invoices:'manage_purchase_invoices',
  // Cashflow
  manage_expenses:         'manage_expenses',
  approve_expense:         'manage_expenses',
  manage_checks:           'manage_checks',
  manage_cash:             'manage_cash',
  // Pricing
  manage_pricelist:        'manage_pricelist',
  manage_budget:           'manage_budget',
  // Stock
  view_stock:              'view_stock',
  manage_stock:            'manage_stock',
  create_stock_movement:   'manage_stock_movements',
  count_stock:             'manage_stock_movements',
  view_stock_movements:    'view_stock_movements',
  view_stock_cost:         'view_stock_cost',
  view_stock_forecast:     'view_stock_forecast',
  view_stock_locations:    'view_stock_locations',
  manage_stock_locations:  'manage_stock_locations',
  manage_warehouses:       'manage_stock_locations',
  manage_stock_categories: 'manage_stock_settings',
  manage_equipment:        'manage_equipment',
  manage_suppliers:        'manage_suppliers',
  import_stock:            'manage_stock',
  export_stock:            'view_stock',
  // Customers
  view_customers:          'view_customers',
  manage_customers:        'manage_customers',
  // HR
  view_team:               'view_employees',
  manage_employees:        'manage_employees',
  delete_employee:         'manage_employees',
  view_salaries:           'view_salaries',
  manage_salaries:         'manage_salaries',
  manage_advances:         'manage_salaries',
  manage_bonus:            'manage_salaries',
  manage_attendance:       'manage_attendance',
  approve_leave:           'manage_leaves',
  view_attendance_self:    'view_attendance',
  view_attendance_all:     'view_attendance',
  manage_employee_documents:'manage_employee_documents',
  manage_skills:           'manage_employees',
  view_performance:        'view_performance',
  // Delivery
  view_deliveries:         'view_deliveries',
  mark_delivered:          'manage_deliveries',
  manage_couriers:         'manage_couriers',
  // Comm
  send_messages:           'manage_messages',
  // Users / Settings
  manage_users:            'manage_users',
  manage_permissions:      'manage_permissions',
  view_settings:           'view_settings',
  manage_settings:         'manage_settings',
  manage_integrations:     'manage_integrations',
};

// ─── Reverse alias (new → legacy[]) for bidirectional check ──
const REVERSE_ALIAS: Record<string, string[]> = (() => {
  const r: Record<string, string[]> = {};
  for (const [old, neu] of Object.entries(LEGACY_ALIAS)) {
    if (!r[neu]) r[neu] = [];
    r[neu].push(old);
  }
  return r;
})();

// ─── Permission key type — union of new + legacy (for backward compat) ──
export type PermissionKey =
  // New keys (view_<feature> | manage_<feature>)
  | `view_${FeatureKey}` | `manage_${FeatureKey}`
  // Legacy keys (still accepted by can() via alias)
  | 'create_orders' | 'edit_orders' | 'assign_orders' | 'cancel_orders' | 'delete_orders' | 'export_orders'
  | 'start_stage' | 'complete_stage' | 'report_waste' | 'override_stage' | 'manage_qc'
  | 'upload_design' | 'approve_design'
  | 'approve_orders' | 'reject_orders' | 'approve_messages'
  | 'view_financials' | 'manage_finance' | 'export_reports' | 'export_finance'
  | 'view_cost' | 'view_profit' | 'view_clinic_balance' | 'view_supplier_balance'
  | 'void_invoices' | 'send_einvoice' | 'record_payment' | 'approve_invoice' | 'delete_invoice'
  | 'approve_expense'
  | 'create_stock_movement' | 'count_stock' | 'import_stock' | 'export_stock'
  | 'manage_warehouses' | 'manage_stock_categories' | 'manage_equipment' | 'manage_suppliers'
  | 'view_team' | 'delete_employee' | 'manage_advances' | 'manage_bonus' | 'manage_employee_documents' | 'manage_skills'
  | 'manage_attendance' | 'approve_leave' | 'view_attendance_self' | 'view_attendance_all'
  | 'mark_delivered' | 'manage_couriers'
  | 'send_messages';

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

// ─── PERMISSION_GROUPS (yeni — category bazlı, sadece yeni key'ler) ──
export const PERMISSION_GROUPS: { category: CategoryKey; keys: string[] }[] =
  (Object.keys(PERMISSION_CATEGORIES) as CategoryKey[]).map(cat => ({
    category: cat,
    keys: FEATURES.filter(f => f.category === cat).flatMap(f => {
      const out: string[] = [];
      if (f.hasView)   out.push(`view_${f.key}`);
      if (f.hasManage) out.push(`manage_${f.key}`);
      return out;
    }),
  })).filter(g => g.keys.length > 0);

// ─── Permission labels (auto-generated from FEATURES + legacy) ──
export const PERMISSION_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const f of FEATURES) {
    if (f.hasView)   out[`view_${f.key}`]   = `${f.label} — Görme`;
    if (f.hasManage) out[`manage_${f.key}`] = `${f.label} — Yönetme`;
  }
  // Legacy labels (so PermissionsScreen old views still display readable labels)
  const legacyLabels: Record<string, string> = {
    create_orders:       'Sipariş Oluştur', edit_orders: 'Sipariş Düzenle',
    assign_orders:       'Sipariş Ata',     cancel_orders: 'Sipariş İptal',
    delete_orders:       'Sipariş Sil',     export_orders: 'Sipariş Dışa Aktar',
    start_stage:         'Aşama Başlat',    complete_stage: 'Aşama Tamamla',
    report_waste:        'Fire Bildir',     override_stage: 'Aşama Override',
    manage_qc:           'Kalite Kontrol',
    upload_design:       'Tasarım Yükle',   approve_design: 'Tasarım Onayla',
    approve_orders:      'Sipariş Onayla',  reject_orders: 'Sipariş Reddet',
    approve_messages:    'Mesaj Onayla',
    view_financials:     'Mali Görme',      manage_finance: 'Mali İşlem Yönet',
    view_cost:           'Maliyet Gör',     view_profit: 'Karlılık Gör',
    view_clinic_balance: 'Klinik Bakiye',   view_supplier_balance: 'Tedarikçi Bakiye',
    export_reports:      'Rapor Dışa Aktar',export_finance: 'Mali Dışa Aktar',
    void_invoices:       'Fatura İptal',    send_einvoice: 'E-Fatura Gönder',
    record_payment:      'Ödeme Kaydet',    approve_invoice: 'Fatura Onayla',
    delete_invoice:      'Fatura Sil',      approve_expense: 'Gider Onayla',
    create_stock_movement:'Stok Hareketi Kaydet', count_stock: 'Stok Sayım',
    import_stock:        'Stok İçe Aktar',  export_stock: 'Stok Dışa Aktar',
    manage_warehouses:   'Depo Yönet',      manage_stock_categories: 'Stok Kategori Yönet',
    manage_equipment:    'Demirbaş Yönet',  manage_suppliers: 'Tedarikçi Yönet',
    view_team:           'Ekip Gör',        delete_employee: 'Personel Sil',
    manage_advances:     'Avans Yönet',     manage_bonus: 'Prim Yönet',
    manage_employee_documents: 'Personel Belge Yönet', manage_skills: 'Yetkinlik Yönet',
    manage_attendance:   'Devam Yönet',     approve_leave: 'İzin Onayla',
    view_attendance_self:'Kendi Devam',     view_attendance_all: 'Tüm Devam',
    mark_delivered:      'Teslim Edildi',   manage_couriers: 'Kurye Yönet',
    send_messages:       'Mesaj Gönder',
  };
  for (const [k, v] of Object.entries(legacyLabels)) {
    if (!out[k]) out[k] = v;
  }
  return out;
})();

// ─── All permissions for admin fallback ─────────────────────
const ALL_PERMISSIONS = new Set<string>(NEW_KEYS);

// ─── Expand permissions: legacy ⇄ new bidirectional ─────────
// DB'de eski key varsa, yeni karşılığını da set'e ekle (kod yeni key sorabilir).
// DB'de yeni key varsa, eski karşılığını da ekle (eski kod hâlâ çalışsın).
function expandPermissions(perms: Set<string>): Set<string> {
  const out = new Set(perms);
  for (const p of perms) {
    const neu = LEGACY_ALIAS[p];
    if (neu) out.add(neu);
    const olds = REVERSE_ALIAS[p];
    if (olds) for (const o of olds) out.add(o);
  }
  return out;
}

// ─── Panel → role key mapping ───────────────────────────────
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
  activePanel: string | null;

  can: (key: PermissionKey | string) => boolean;
  canAny: (...keys: (PermissionKey | string)[]) => boolean;
  canAll: (...keys: (PermissionKey | string)[]) => boolean;

  fetchPermissions: () => Promise<void>;
  fetchForPanel: (panel: string, userType?: string) => Promise<void>;
  invalidate: () => void;
  clear: () => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: new Set<string>(),
  loaded: false,
  loading: false,
  activePanel: null,

  can: (key) => get().permissions.has(key as string),

  canAny: (...keys) => keys.some(k => get().permissions.has(k as string)),

  canAll: (...keys) => keys.every(k => get().permissions.has(k as string)),

  fetchPermissions: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', user.id)
          .maybeSingle();
        if (prof?.user_type === 'admin') {
          set({ permissions: expandPermissions(new Set(ALL_PERMISSIONS)), loaded: true });
          return;
        }
      }

      const { data, error } = await supabase.rpc('get_my_permissions');
      if (!error && Array.isArray(data)) {
        set({ permissions: expandPermissions(new Set(data as string[])), loaded: true });
      } else {
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
    if (!roleKey) return get().fetchPermissions();

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
      set({ permissions: expandPermissions(new Set(ALL_PERMISSIONS)), loaded: true, activePanel: panel, loading: false });
      return;
    }

    const isAdmin = resolvedUserType === 'admin';
    const targetRole = isAdmin && panel !== 'admin' ? roleKey : null;

    if (!isAdmin && get().activePanel === panel && get().loaded) return;

    set({ loading: true, activePanel: panel });
    try {
      let data: any;
      let error: any;

      if (targetRole) {
        ({ data, error } = await supabase.rpc('get_role_permissions', { p_role: targetRole }));
      } else {
        ({ data, error } = await supabase.rpc('get_my_permissions'));
      }

      if (!error && Array.isArray(data)) {
        set({ permissions: expandPermissions(new Set(data as string[])), loaded: true });
      } else if (isAdmin) {
        set({ permissions: expandPermissions(new Set(ALL_PERMISSIONS)), loaded: true });
      } else {
        console.warn('[permissions] RPC failed for non-admin', error?.message);
        set({ permissions: new Set(), loaded: true });
      }
    } catch (e: any) {
      if (isAdmin) {
        set({ permissions: expandPermissions(new Set(ALL_PERMISSIONS)), loaded: true });
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

// ─── Helper hook: useFeaturePerms('stock') → { canView, canManage } ──
export function useFeaturePerms(feature: FeatureKey): { canView: boolean; canManage: boolean } {
  const can = usePermissionStore(s => s.can);
  return {
    canView:   can(`view_${feature}` as PermissionKey),
    canManage: can(`manage_${feature}` as PermissionKey),
  };
}
