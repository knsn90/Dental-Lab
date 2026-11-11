// Genel bakış sekmesinin saf yardımcıları (React yok) — çip sıralaması, fark metni,
// çubuk oranları. `node --test` ile sınanır (overview.test.mts).
import type { MonthKey } from './months';
import type { CountedOrder } from './aggregate';

/** Trend çiplerinde "Diğer…" menüsüne düşmeden gösterilen iş tipi sayısı. */
export const CHIP_LIMIT = 6;

/**
 * Penceredeki iş tiplerini toplam miktara göre (çoktan aza, eşitlikte ada göre)
 * sıralar. Klinik süzgeci verilirse yalnız o kliniğin siparişleri sayılır.
 */
export function rankWorkTypes(counted: CountedOrder[], months: MonthKey[], clinicId: string | null): string[] {
  const inWin = new Set(months);
  const tot = new Map<string, number>();
  for (const c of counted) {
    if (!inWin.has(c.month)) continue;
    if (clinicId && c.clinicId !== clinicId) continue;
    tot.set(c.workType, (tot.get(c.workType) ?? 0) + c.qty);
  }
  return Array.from(tot, ([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'tr'))
    .map((x) => x.label);
}

/** İlk `limit` çip görünür, kalanı "Diğer…" menüsünde. */
export function splitChips(chips: string[], limit = CHIP_LIMIT): { visible: string[]; overflow: string[] } {
  return { visible: chips.slice(0, limit), overflow: chips.slice(limit) };
}

export type DiffDir = 'up' | 'down' | 'flat';

/**
 * Kıyas farkı. Kıyas yoksa (kayıt dönemi dışı) `null` — ekranda "—"; hiçbir
 * zaman sıfırla kıyaslanıp uydurma bir artış üretilmez.
 */
export function diffOf(cur: number, cmp: number | null | undefined): { delta: number; dir: DiffDir } | null {
  if (cmp == null) return null;
  const delta = Math.round((cur - cmp) * 10) / 10;
  return { delta, dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/** İşaretli fark: "+3", "−21" (U+2212), "0". */
export function signedText(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '0';
}

/**
 * KPI kutusunun alt satırı: "−21 · Eki 84". Kıyas yoksa
 * "— · <yokNotu>" (not çağırandan, çevrilmiş olarak gelir).
 */
export function kpiDiffText(cur: number, cmp: number | null | undefined, cmpMonthShort: string, noRecordNote: string): string {
  const d = diffOf(cur, cmp);
  if (!d) return `— · ${noRecordNote}`;
  return `${signedText(d.delta)} · ${cmpMonthShort} ${cmp}`;
}

/** Çubuk oranı (0–100). Değer 0 → 0; pozitif değer en az `min` (görünür kalsın). */
export function barPct(value: number | null | undefined, max: number, min = 4): number {
  if (!value || value <= 0 || max <= 0) return 0;
  return Math.min(100, Math.max(min, (value / max) * 100));
}

/** Seçili sütunu görünür alanın ortasına getiren kaydırma (sınırlar içinde). */
export function scrollOffsetFor(index: number, colW: number, viewW: number, contentW: number): number {
  const raw = index * colW + colW / 2 - viewW / 2;
  return Math.max(0, Math.min(raw, Math.max(0, contentW - viewW)));
}
