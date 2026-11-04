// Sağlık Kurumları sol menüsü — saf kurallar (React Native içe aktarmaz; node --test ile sınanır).
// Kullanıcı onayı 2026-11-04: sekme şeridi yerine Finans gibi sol menü; mobilde 3 sekme + menü.

export const CLINIC_TYPE_KEYS = ['muayenehane', 'klinik', 'poliklinik', 'hastane', 'laboratuvar'] as const;
export type ClinicTypeKey = (typeof CLINIC_TYPE_KEYS)[number];
export type ClinicsTabKey = 'all' | ClinicTypeKey | 'doctors' | 'managers' | 'connections' | 'reviews';

export interface ClinicsNavItem { key: ClinicsTabKey; label: string; hint: string }
export interface ClinicsNavGroup { title: string; items: ClinicsNavItem[] }
export interface ClinicsPill { key: ClinicsTabKey; label: string; active: boolean }

const TYPE_LABELS: Record<ClinicTypeKey, string> = {
  muayenehane: 'Muayenehane',
  klinik: 'Klinik',
  poliklinik: 'Poliklinik',
  hastane: 'Hastane',
  laboratuvar: 'Laboratuvar',
};
const TYPE_HINT = 'Bu türdeki sağlık kurumları';

const OTHER: Record<Exclude<ClinicsTabKey, ClinicTypeKey>, { label: string; hint: string }> = {
  all: { label: 'Tüm kurumlar', hint: 'Laboratuvara bağlı sağlık kurumları' },
  doctors: { label: 'Hekimler', hint: 'Kurumlara kayıtlı hekimler' },
  managers: { label: 'Yöneticiler', hint: 'Klinik yöneticisi hesapları' },
  connections: { label: 'Bağlantılar', hint: 'Davet kodu, katılım kodu ve bekleyen istekler' },
  reviews: { label: 'Değerlendirmeler', hint: 'Puan ortalaması, klinik kırılımı ve düşük puan takibi' },
};

export const isClinicType = (k: string): k is ClinicTypeKey => (CLINIC_TYPE_KEYS as readonly string[]).includes(k);

/** Bölüm başlığı + açıklaması; bilinmeyen anahtar → null. */
export function clinicsSection(key: string): ClinicsNavItem | null {
  if (isClinicType(key)) return { key, label: TYPE_LABELS[key], hint: TYPE_HINT };
  if (key in OTHER) {
    const k = key as keyof typeof OTHER;
    return { key: k, ...OTHER[k] };
  }
  return null;
}

const item = (k: ClinicsTabKey) => clinicsSection(k)!;

/** Masaüstü sol menüsü: Kurumlar · Kişiler · Takip (Değerlendirmeler yalnız yetkiliye). */
export function clinicsNavGroups({ canSeeReviews }: { canSeeReviews: boolean }): ClinicsNavGroup[] {
  return [
    { title: 'Kurumlar', items: [item('all'), ...CLINIC_TYPE_KEYS.map(item)] },
    { title: 'Kişiler', items: [item('doctors'), item('managers')] },
    { title: 'Takip', items: canSeeReviews ? [item('connections'), item('reviews')] : [item('connections')] },
  ];
}

/**
 * Mobil sekmeler: her sekme bir grubun yeridir (Kurumlar · Kişiler · Takip) ve o grubun
 * seçili bölümünü, seçili değilse varsayılanını gösterir: Kurumlar · Hekimler · Puanlar
 * (Değerlendirmeler yetkisi yoksa Bağlantılar). Böylece hep üç sekme kalır, etiketler sığar.
 */
export function clinicsMobilePills({ canSeeReviews, activeKey }: { canSeeReviews: boolean; activeKey: ClinicsTabKey }): ClinicsPill[] {
  const first: { key: ClinicsTabKey; label: string } = isClinicType(activeKey)
    ? { key: activeKey, label: TYPE_LABELS[activeKey] }
    : { key: 'all', label: 'Kurumlar' };
  const second: { key: ClinicsTabKey; label: string } = activeKey === 'managers'
    ? { key: 'managers', label: OTHER.managers.label }
    : { key: 'doctors', label: OTHER.doctors.label };
  const followDefault: ClinicsTabKey = canSeeReviews ? 'reviews' : 'connections';
  const followKey: ClinicsTabKey = activeKey === 'connections' || (activeKey === 'reviews' && canSeeReviews) ? activeKey : followDefault;
  const third = { key: followKey, label: followKey === 'reviews' ? 'Puanlar' : OTHER.connections.label };
  return [first, second, third].map((p) => ({ ...p, active: p.key === activeKey }));
}

/** ?tab= değerini geçerli ve yetkili bir bölüme çevirir; değilse null. */
export function resolveClinicsTab(param: string | string[] | undefined, { canSeeReviews }: { canSeeReviews: boolean }): ClinicsTabKey | null {
  const v = Array.isArray(param) ? param[0] : param;
  if (!v) return null;
  const s = clinicsSection(v);
  if (!s) return null;
  if (s.key === 'reviews' && !canSeeReviews) return null;
  return s.key;
}
