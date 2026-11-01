/**
 * Hasta yaşı — saf yardımcılar (patientAge.test.mts).
 *
 * 2026-10-19: Siparişte doğum tarihi yerine YAŞ istenir (work_orders.patient_age;
 * daha az kişisel veri). Eski siparişlerde yaş yoksa doğum tarihinden hesaplanır.
 * Belge tarayıcı (OCR) / Denty doğum tarihi bulursa yaşa çevrilir.
 */

const MAX_AGE = 120;

/** Doğum tarihinden bugünkü yaş. Boş/bozuk/gelecek tarih → null. */
export function ageFromDob(dob: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (dob == null || dob === '') return null;
  const d = dob instanceof Date ? dob : new Date(`${String(dob).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime()) || d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age <= MAX_AGE ? age : null;
}

/** Form girdisi → yaş. Yalnız 0–120 tam sayı; diğer her şey null. */
export function parseAgeInput(s: string | null | undefined): number | null {
  const t = String(s ?? '').trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_AGE ? n : null;
}

/** Yazarken: Farsça/Arapça rakamlar Batı rakamına çevrilir, yalnız rakam, en çok 3 hane. */
export function sanitizeAgeInput(s: string): string {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
    .slice(0, 3);
}

/** Siparişte gösterilecek yaş: kayıtlı yaş, yoksa (eski sipariş) doğum tarihinden. */
export function orderAge(o: { patient_age?: number | null; patient_dob?: string | null }, now: Date = new Date()): number | null {
  if (typeof o.patient_age === 'number' && o.patient_age >= 0) return o.patient_age;
  return ageFromDob(o.patient_dob ?? null, now);
}
