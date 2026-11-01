/**
 * İş emri etiketi (kutuya yapıştırılan çıktı) — saf yardımcılar.
 *
 * Şablon (`lib/printWorkLabelHtml.ts`) ve veri hazırlığı
 * (`buildOrderPrintDoc.ts`) bunları kullanır. Burada React, Supabase ya da
 * i18n YOK; `workLabel.test.mts` node ile doğrudan çalıştırır.
 */

export type LabelSize = 'A4' | 'A5' | 'A6';
export const LABEL_SIZES: readonly LabelSize[] = ['A4', 'A5', 'A6'];
/** Bugüne kadar iş kağıdı A5 basılıyordu; ilk açılışta da o gelsin. */
export const DEFAULT_LABEL_SIZE: LabelSize = 'A5';
/** Son seçilen boyut cihazda hatırlanır (yalnız web — yazdırma web'e özgü). */
export const LABEL_SIZE_STORAGE_KEY = 'siman.workLabelSize';

export function readLabelSize(raw: unknown): LabelSize {
  return (LABEL_SIZES as readonly unknown[]).includes(raw) ? (raw as LabelSize) : DEFAULT_LABEL_SIZE;
}

// ── Hasta baş harfleri ────────────────────────────────────────────────────
// Sağlık Bakanlığı gereği etikete hastanın adı yazılmaz; yalnız ilk adın ve
// soyadın baş harfi: "Arzu Seğmen" → "A. S.". Ortadaki adlar atlanır.
const LETTER = /\p{L}/u;

function firstLetter(word: string): string {
  const ch = Array.from(word).find(c => LETTER.test(c));
  return ch ? ch.toLocaleUpperCase('tr-TR') : '';
}

export function patientInitials(name: string | null | undefined): string {
  const words = String(name ?? '').trim().split(/\s+/).map(firstLetter).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return `${words[0]}.`;
  return `${words[0]}. ${words[words.length - 1]}.`;
}

// ── FDI çeyrekleri ────────────────────────────────────────────────────────
// Etikette diş haçı hekimin baktığı yönde çizilir: üst satır sağ-üst (Q1) |
// sol-üst (Q2), alt satır sağ-alt (Q4) | sol-alt (Q3). Sağ çeyreklerde orta hat
// SAĞDA olduğu için dişler büyükten küçüğe dizilir (18 … 11).
// Süt dişleri (5x-8x) kalıcı dişin çeyreğine düşer.
export interface FdiQuadrants { ur: number[]; ul: number[]; ll: number[]; lr: number[] }

const QUADRANT: Record<number, keyof FdiQuadrants> = { 1: 'ur', 5: 'ur', 2: 'ul', 6: 'ul', 3: 'll', 7: 'll', 4: 'lr', 8: 'lr' };

export function groupFdi(teeth: readonly number[]): FdiQuadrants {
  const out: FdiQuadrants = { ur: [], ul: [], ll: [], lr: [] };
  const seen = new Set<number>();
  for (const raw of teeth ?? []) {
    const t = Number(raw);
    if (!Number.isInteger(t) || seen.has(t)) continue;
    const q = QUADRANT[Math.floor(t / 10)];
    const pos = t % 10;
    const max = Math.floor(t / 10) >= 5 ? 5 : 8;
    if (!q || pos < 1 || pos > max) continue;
    seen.add(t);
    out[q].push(t);
  }
  // Sıralama diş konumuna (birler basamağı) göre; süt + kalıcı karışıkta da doğru.
  const desc = (a: number, b: number) => (b % 10) - (a % 10) || b - a;
  const asc = (a: number, b: number) => (a % 10) - (b % 10) || a - b;
  out.ur.sort(desc); out.lr.sort(desc);
  out.ul.sort(asc); out.ll.sort(asc);
  return out;
}

// ── İş özeti ──────────────────────────────────────────────────────────────
export interface WorkLine { name: string; count: number }

interface SummaryItem { name?: string | null; quantity?: number | null; tooth_numbers?: number[] | null }

/**
 * Etiketin büyük satırı. Kalem varsa kalemlerden (dişli kalemde diş sayısı,
 * dişsizde miktar), yoksa work_type'tan. En kalabalık iş başa gelir.
 */
export function summarizeWork(input: { items?: SummaryItem[] | null; workType?: string | null; teethCount: number }): WorkLine[] {
  const acc = new Map<string, number>();
  const add = (name: string, n: number) => acc.set(name, (acc.get(name) ?? 0) + n);

  for (const it of input.items ?? []) {
    const name = (it.name ?? '').trim();
    if (!name) continue;
    const teeth = Array.isArray(it.tooth_numbers) ? it.tooth_numbers.length : 0;
    add(name, teeth > 0 ? teeth : Math.max(1, Number(it.quantity) || 1));
  }

  if (acc.size === 0) {
    const segs = (input.workType ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const distinct = new Set(segs);
    if (distinct.size === 1 && segs.length === 1 && input.teethCount > 0) add(segs[0], input.teethCount);
    else segs.forEach(s => add(s, 1));
  }

  // Map ekleme sırasını korur → sort kararlı olduğu için eşitlikte ilk görülen önde.
  return [...acc.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// ── Diş haçı ölçüsü ───────────────────────────────────────────────────────
// Mono yazıda iki haneli diş ≈ 1.2em, aralık .45em, çeyrek iç dolgusu 2×.6em;
// orta çizgi + yuvarlama için .4em pay (payısız tam arkta son diş alt satıra düşüyordu).
const TOOTH_EM = 1.2;
const GAP_EM = 0.45;
const PAD_EM = 1.6;

/**
 * Haç genişliği (mm) ve diş yazısı (mm). Az dişte boyutun taban ölçüsü;
 * kalabalık çeyrekte genişler; sayfa içine sığmıyorsa yazı küçülür.
 */
export function crossLayout(p: { maxPerQuadrant: number; baseWidth: number; font: number; innerWidth: number }): { width: number; font: number } {
  const n = Math.max(0, p.maxPerQuadrant);
  if (n === 0) return { width: p.baseWidth, font: p.font };
  const needEm = 2 * (n * TOOTH_EM + (n - 1) * GAP_EM + PAD_EM);
  const need = needEm * p.font;
  if (need <= p.baseWidth) return { width: p.baseWidth, font: p.font };
  if (need <= p.innerWidth) return { width: Math.round(need * 10) / 10, font: p.font };
  return { width: p.innerWidth, font: Math.floor((p.innerWidth / needEm) * 100) / 100 };
}

// ── A4 işlem tablosu ──────────────────────────────────────────────────────
export interface LabelToothOp {
  tooth: number; workType: string; shade?: string | null; material?: string | null;
  implantSystem?: string | null; implantType?: string | null; abutment?: string | null; screw?: string | null;
}
export interface LabelOpRow { work: string; detail: string; shade: string; teeth: number[] }

export function labelOps(ops: readonly LabelToothOp[] | null | undefined): LabelOpRow[] {
  const rows = new Map<string, LabelOpRow>();
  for (const o of ops ?? []) {
    const work = (o.workType ?? '').trim() || '—';
    const detail = [o.material, o.implantSystem, o.implantType, o.abutment, o.screw]
      .map(s => (s ?? '').trim()).filter(Boolean).join(' · ');
    const shade = (o.shade ?? '').trim();
    const key = `${work}\u0000${detail}\u0000${shade}`;
    const row = rows.get(key) ?? { work, detail, shade, teeth: [] };
    if (Number.isInteger(o.tooth) && !row.teeth.includes(o.tooth)) row.teeth.push(o.tooth);
    rows.set(key, row);
  }
  return [...rows.values()].map(r => ({ ...r, teeth: [...r.teeth].sort((a, b) => a - b) }));
}

// ── Tarih ─────────────────────────────────────────────────────────────────
/** "14 Eki Çar" — yıl yalnız içinde bulunulan yıldan farklıysa eklenir. */
export function formatLabelDate(d: Date | string | null | undefined, locale: string, now: Date = new Date()): string {
  if (d == null || d === '') return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const otherYear = dt.getFullYear() !== now.getFullYear();
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric', month: 'short', weekday: 'short', ...(otherYear ? { year: 'numeric' } : {}),
    }).format(dt);
  } catch {
    return dt.toISOString().slice(0, 10);
  }
}

// ── QR ────────────────────────────────────────────────────────────────────
/**
 * QR modül matrisinden tek path'lik SVG. Etiket QR'ı artık yerelde üretiliyor:
 * eskiden ekranda QR yoksa api.qrserver.com'a sipariş adresi gönderilip görsel
 * çekiliyordu (dış servis + yazdırmadan önce görselin yüklenmesini bekleme).
 */
export function qrSvgFromModules(size: number, isDark: (row: number, col: number) => boolean | number, quiet = 2): string {
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const v = size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet">`
    + `<rect width="${v}" height="${v}" fill="#fff"/><path d="${d}" fill="#0A0A0A"/></svg>`;
}
