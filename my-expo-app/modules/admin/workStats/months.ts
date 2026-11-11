// Ay yardımcıları — saf (React/Supabase yok). Anahtar: 'YYYY-MM' (yerel takvim ayı).
export type MonthKey = string;
export type CompareMode = 'prev' | 'lastYear';

const pad = (n: number) => String(n).padStart(2, '0');

export function monthKeyOf(d: Date): MonthKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthKeyOfIso(iso: string | null | undefined): MonthKey | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return monthKeyOf(d);
}

export function shiftMonth(k: MonthKey, delta: number): MonthKey {
  const [y, m] = k.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  return `${ny}-${pad(nm + 1)}`;
}

/** Seçili ay dahil, eskiden yeniye, uzunluk n. */
export function windowMonths(selected: MonthKey, n: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftMonth(selected, -i));
  return out;
}

export function compareMonth(selected: MonthKey, mode: CompareMode): MonthKey {
  return shiftMonth(selected, mode === 'prev' ? -1 : -12);
}

/**
 * Ay kovaları miladi takvim ayıdır; etiket de HER ZAMAN miladi olmalı. printLocale()
 * Farsça'da 'fa-IR-u-ca-persian' dönebilir → Kasım kovası "آبان" (≈10 gün kayık) olurdu.
 * Dil ve rakamlar korunur, takvim uzantısı `-u-ca-gregory`'ye zorlanır.
 */
export function gregorianLocale(locale: string): string {
  const tag = locale || 'tr-TR';
  // Unicode uzantısındaki takvim anahtarı: "-ca-<değer>" (değer 3–8 karakterli alt etiketler)
  if (/-u(?:-[a-z0-9]{2,8})*-ca-/i.test(tag)) {
    return tag.replace(/-ca-[a-z0-9]{3,8}(?:-[a-z0-9]{3,8})*/i, '-ca-gregory');
  }
  if (/-u-/i.test(tag)) return tag.replace(/-u-/i, '-u-ca-gregory-');
  return `${tag}-u-ca-gregory`;
}

export function monthLabel(k: MonthKey, locale: string, style: 'short' | 'long'): string {
  const [y, m] = k.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat(gregorianLocale(locale), style === 'long'
    ? { month: 'long', year: 'numeric' }
    : { month: 'short' }).format(d);
}

/** Seçili aydan 23 ay öncesinin 1'i 00:00 (yerel) — ISO. */
export function fetchFromIso(selected: MonthKey): string {
  const [y, m] = shiftMonth(selected, -23).split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
}
