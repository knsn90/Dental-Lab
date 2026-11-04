// Değerlendirmeler ekranı — saf kurallar (yalnız tip içe aktarır; node --test ile sınanır).
// Spec: docs/superpowers/specs/2026-11-04-degerlendirmeler-ekrani-design.md
import type { ReviewClinicRow, ReviewDashRow, ReviewLowRow, ScoreKey } from './types';

/** Etkin en düşük puan bu değer ya da altındaysa "düşük". Sunucudaki 3 ile aynı. */
export const REVIEW_LOW_MAX = 3;

/** Rozet, bildirim ve WhatsApp'ta kullanılan kısa etiketler (SQL _review_low_scores_text ile birebir). */
export const SCORE_SHORT_LABELS: Record<ScoreKey, string> = {
  overall: 'Genel',
  fit: 'Uyum',
  occlusion: 'Oklüzyon',
  contacts: 'Kontakt',
  esthetics: 'Estetik',
  surface: 'Yüzey',
  on_time: 'Zamanında teslim',
};

const SCORE_ORDER: ScoreKey[] = ['overall', 'fit', 'occlusion', 'contacts', 'esthetics', 'surface', 'on_time'];

export type WaButtonLabel = 'Sorunsuz' | 'Küçük düzeltme' | 'Sorun var';

/** WhatsApp düğme cevabının hekimin gördüğü adı. */
export function waButtonLabel(answer: number | null): WaButtonLabel | null {
  if (answer === 5) return 'Sorunsuz';
  if (answer === 3) return 'Küçük düzeltme';
  if (answer === 1) return 'Sorun var';
  return null;
}

export interface LowChip { key: ScoreKey | 'whatsapp'; label: string; score: number }

/** Düşük olan puanlar, sabit sırayla; WhatsApp cevabı en sonda (değerlendirme WhatsApp'tan gelmediyse). */
export function lowChips(row: ReviewDashRow): LowChip[] {
  const out: LowChip[] = [];
  for (const key of SCORE_ORDER) {
    const v = row[key];
    if (typeof v === 'number' && v <= REVIEW_LOW_MAX) out.push({ key, label: `${SCORE_SHORT_LABELS[key]} ${v}`, score: v });
  }
  const wa = row.wa_answer;
  if ((wa === 1 || wa === 3) && row.source !== 'whatsapp') out.push({ key: 'whatsapp', label: `WhatsApp ${wa}`, score: wa });
  return out;
}

/** Sunucudaki alıcı kümesiyle aynı: yönetim paneli kullanıcısı ya da lab yöneticisi. */
export function canSeeReviewDashboard(p: { user_type?: string | null; role?: string | null } | null): boolean {
  if (!p) return false;
  return p.user_type === 'admin' || (p.user_type === 'lab' && p.role === 'manager');
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Bu ay − karşılaştırma, bir ondalık. */
export function avgDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  return round1(cur - prev);
}

const byName = (a: ReviewClinicRow, b: ReviewClinicRow) => (a.name ?? '').localeCompare(b.name ?? '', 'tr');

/**
 * Önce bu ay puanı ve önceki 3 ay ortalaması olanlar (en çok düşen önce),
 * sonra bu ay puanı olup geçmişi olmayanlar ("yeni"), en sonda bu ay puanı olmayanlar.
 */
export function sortClinicRows(rows: ReviewClinicRow[]): ReviewClinicRow[] {
  const rank = (r: ReviewClinicRow) => (r.month_count > 0 ? (r.prev3_avg != null ? 0 : 1) : 2);
  return [...rows].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const d = (avgDelta(a.month_avg, a.prev3_avg) ?? 0) - (avgDelta(b.month_avg, b.prev3_avg) ?? 0);
      if (d !== 0) return d;
    }
    return byName(a, b);
  });
}

/** 1–5 ölçeğinde mini grafik noktaları; boş ay çizgiyi böler. */
export function sparkSegments(series: (number | null)[], w: number, h: number): { x: number; y: number }[][] {
  const n = series.length;
  const segs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  series.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur);
      cur = [];
      return;
    }
    const x = n > 1 ? (i * w) / (n - 1) : w / 2;
    const clamped = Math.min(5, Math.max(1, v));
    cur.push({ x, y: ((5 - clamped) / 4) * h });
  });
  if (cur.length) segs.push(cur);
  return segs;
}

const ts = (s: string | null) => (s ? Date.parse(s) : 0);

/** Açıklar (en uzun bekleyen önce), sonra arananlar (en son aranan önce). */
export function sortLows(rows: ReviewLowRow[]): ReviewLowRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
    if (a.is_open) return ts(a.period_started_at) - ts(b.period_started_at);
    return ts(b.called_at) - ts(a.called_at);
  });
}

/** Açık iş varsa liste "Aranmadı" süzgeciyle açılır. */
export function defaultLowFilter(rows: ReviewLowRow[]): 'open' | 'all' {
  return rows.some((r) => r.is_open) ? 'open' : 'all';
}

const HOUR = 3600_000;

/** Dönem başından beri geçen tam gün; 48 saatten azsa null. */
export function daysUncalled(periodStartedAt: string | null, now: Date): number | null {
  if (!periodStartedAt) return null;
  const hours = (now.getTime() - Date.parse(periodStartedAt)) / HOUR;
  if (!(hours >= 48)) return null;
  return Math.floor(hours / 24);
}

/** Aranacak numara (sunucu klinik/hekim önceliğini seçer); boşsa null. */
export function callPhone(row: ReviewLowRow): string | null {
  const p = (row.phone ?? '').trim();
  return p ? p : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-01' ayını delta ay kaydırır. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

/** Türkiye saati sabit UTC+3 (2016'dan beri yaz saati yok). */
const TR_OFFSET_MS = 3 * HOUR;

/** Türkiye saatiyle bu ay ('YYYY-MM-01'). */
export function currentTrMonth(now: Date): string {
  const tr = new Date(now.getTime() + TR_OFFSET_MS);
  return `${tr.getUTCFullYear()}-${pad(tr.getUTCMonth() + 1)}-01`;
}

/** Ay, Türkiye saatiyle bu aydan sonra mı? */
export function isFutureMonth(month: string, now: Date): boolean {
  return month > currentTrMonth(now);
}

/** Tek ondalık, dilin ondalık ayırıcısıyla; null → '—'. */
export function formatAvg(n: number | null, locale: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

/** Meta satırı ayırıcısı. Farsça'da "·" Farsça sıfıra (۰) benzer, rakamın yanında
 *  "۲ پایین" → "۲۰ پایین" okunur; orada Farsça virgül kullanılır. */
export function metaSep(lang: string): string {
  return lang === 'fa' ? '، ' : ' · ';
}
