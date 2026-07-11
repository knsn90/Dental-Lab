/**
 * Klinik panel yetki yardımcıları
 *
 * Sekreter / yedek yönetici / hekim için `profiles.clinic_permissions` JSONB'sinden
 * yetkileri okur; clinic_admin için TÜM yetkileri açık döndürür.
 *
 * Tek doğruluk kaynağı: ClinicUsersScreen → UserFormModal'daki PERMISSION_KEYS.
 */
import { Profile } from '../../lib/types';

export type ClinicPermKey =
  | 'orders_view'
  | 'orders_create'
  | 'orders_edit'
  | 'doctors_manage'
  | 'users_manage'
  | 'settings_manage'
  | 'billing_view';

export type ClinicPerms = Record<ClinicPermKey, boolean>;

const DEFAULT_ADMIN_PERMS: ClinicPerms = {
  orders_view:     true,
  orders_create:   true,
  orders_edit:     true,
  doctors_manage:  true,
  users_manage:    true,
  settings_manage: true,
  billing_view:    true,
};

const DEFAULT_DOCTOR_PERMS: ClinicPerms = {
  orders_view:     true,
  orders_create:   true,
  orders_edit:     true,
  doctors_manage:  false,
  users_manage:    false,
  settings_manage: false,
  billing_view:    false,
};

const DEFAULT_SECRETARY_PERMS: ClinicPerms = {
  orders_view:     true,
  orders_create:   true,
  orders_edit:     true,
  doctors_manage:  false,
  users_manage:    false,
  settings_manage: false,
  billing_view:    true,
};

const EMPTY_PERMS: ClinicPerms = {
  orders_view:     false,
  orders_create:   false,
  orders_edit:     false,
  doctors_manage:  false,
  users_manage:    false,
  settings_manage: false,
  billing_view:    false,
};

/**
 * Bir profilin etkin klinik yetkilerini döndürür.
 * - clinic_admin → her zaman tüm yetkiler açık (UI'da yetki tablosu silinse bile yönetici full erişim)
 * - clinic_secretary / doctor → JSONB'den; boşsa rol bazlı default
 * - diğer roller → EMPTY (klinik paneline gelmemesi gereken kullanıcı)
 */
export function resolveClinicPerms(profile?: Profile | null): ClinicPerms {
  if (!profile) return EMPTY_PERMS;
  if (profile.user_type === 'clinic_admin') return DEFAULT_ADMIN_PERMS;

  const fromDb = (profile.clinic_permissions ?? null) as Partial<ClinicPerms> | null;
  const hasAny = fromDb && Object.keys(fromDb).length > 0;

  const defaults =
    (profile.user_type as string) === 'clinic_secretary' ? DEFAULT_SECRETARY_PERMS :
    profile.user_type === 'doctor'           ? DEFAULT_DOCTOR_PERMS :
    EMPTY_PERMS;

  if (!hasAny) return defaults;

  return {
    orders_view:     !!(fromDb!.orders_view     ?? defaults.orders_view),
    orders_create:   !!(fromDb!.orders_create   ?? defaults.orders_create),
    orders_edit:     !!(fromDb!.orders_edit     ?? defaults.orders_edit),
    doctors_manage:  !!(fromDb!.doctors_manage  ?? defaults.doctors_manage),
    users_manage:    !!(fromDb!.users_manage    ?? defaults.users_manage),
    settings_manage: !!(fromDb!.settings_manage ?? defaults.settings_manage),
    billing_view:    !!(fromDb!.billing_view    ?? defaults.billing_view),
  };
}

/** Kullanıcı klinik admin mi? (kısayol) */
export function isClinicAdminProfile(profile?: Profile | null): boolean {
  return profile?.user_type === 'clinic_admin';
}
