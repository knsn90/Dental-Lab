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
  // Production
  | 'view_production'
  | 'complete_stage'
  | 'report_waste'
  // Finance
  | 'view_financials'
  | 'view_cost'
  | 'manage_finance'
  // Stock
  | 'view_stock'
  | 'manage_stock'
  // Design
  | 'approve_design'
  // Users
  | 'manage_users'
  | 'view_team'
  // Delivery
  | 'view_deliveries'
  | 'mark_delivered'
  // Settings
  | 'view_settings'
  | 'manage_settings'
  // Approvals
  | 'view_approvals'
  | 'approve_orders';

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
  orders:     'Siparisler',
  production: 'Uretim',
  finance:    'Mali Islemler',
  stock:      'Stok & Depo',
  design:     'Tasarim',
  users:      'Kullanici Yonetimi',
  delivery:   'Teslimat',
  settings:   'Ayarlar',
  approvals:  'Onaylar',
};

// ─── Group permissions by category ──────────────────────────
export const PERMISSION_GROUPS: { category: string; keys: PermissionKey[] }[] = [
  { category: 'orders',     keys: ['view_orders', 'create_orders', 'edit_orders', 'assign_orders'] },
  { category: 'production', keys: ['view_production', 'complete_stage', 'report_waste'] },
  { category: 'finance',    keys: ['view_financials', 'view_cost', 'manage_finance'] },
  { category: 'stock',      keys: ['view_stock', 'manage_stock'] },
  { category: 'design',     keys: ['approve_design'] },
  { category: 'users',      keys: ['manage_users', 'view_team'] },
  { category: 'delivery',   keys: ['view_deliveries', 'mark_delivered'] },
  { category: 'settings',   keys: ['view_settings', 'manage_settings'] },
  { category: 'approvals',  keys: ['view_approvals', 'approve_orders'] },
];

// ─── Permission labels (fallback if DB not loaded) ──────────
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_orders:     'Siparisleri Gor',
  create_orders:   'Siparis Olustur',
  edit_orders:     'Siparis Duzenle',
  assign_orders:   'Siparis Ata',
  view_production: 'Uretimi Gor',
  complete_stage:  'Asama Tamamla',
  report_waste:    'Fire Bildir',
  view_financials: 'Mali Islemleri Gor',
  view_cost:       'Maliyet Gor',
  manage_finance:  'Mali Islem Yonet',
  view_stock:      'Stok Gor',
  manage_stock:    'Stok Yonet',
  approve_design:  'Tasarim Onayla',
  manage_users:    'Kullanici Yonet',
  view_team:       'Ekibi Gor',
  view_deliveries: 'Teslimatlari Gor',
  mark_delivered:  'Teslim Edildi Isaretle',
  view_settings:   'Ayarlari Gor',
  manage_settings: 'Ayarlari Yonet',
  view_approvals:  'Onaylari Gor',
  approve_orders:  'Siparis Onayla',
};

// ─── All permissions (fallback when RPC doesn't exist yet) ──
const ALL_PERMISSIONS = new Set<string>([
  'view_orders','create_orders','edit_orders','assign_orders',
  'view_production','complete_stage','report_waste',
  'view_financials','view_cost','manage_finance',
  'view_stock','manage_stock','approve_design',
  'manage_users','view_team',
  'view_deliveries','mark_delivered',
  'view_settings','manage_settings',
  'view_approvals','approve_orders',
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
      const { data, error } = await supabase.rpc('get_my_permissions');
      if (!error && Array.isArray(data)) {
        set({ permissions: new Set(data as string[]), loaded: true });
      } else {
        set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
      }
    } catch {
      set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
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

    // If user is admin viewing a different panel, fetch that panel's role perms
    // If user is not admin, fetch their own perms (ignore panel)
    const isAdmin = userType === 'admin';
    const targetRole = isAdmin && panel !== 'admin' ? roleKey : null;

    // Skip if already loaded for this panel
    if (get().activePanel === panel && get().loaded) return;

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
        set({ permissions: new Set(data as string[]), loaded: true });
      } else {
        set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
      }
    } catch {
      set({ permissions: new Set(ALL_PERMISSIONS), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ activePanel: null, loaded: false }),

  clear: () => set({ permissions: new Set(), loaded: false, loading: false, activePanel: null }),
}));
