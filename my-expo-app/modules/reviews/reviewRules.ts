// İş değerlendirmesi — saf kurallar (içe aktarma yok; node --test ile sınanır).
// Spec: docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md

/** Panodaki "değerlendirme bekleyen" listesi teslimden sonra bu kadar gün açık kalır. */
export const PENDING_REVIEW_DAYS = 30;

export function pendingReviewSince(now: Date): string {
  return new Date(now.getTime() - PENDING_REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export type ReviewSourceLabel = 'WhatsApp · hekim' | 'WhatsApp · klinik hattı' | 'Klinik' | 'Hekim';

/** Değerlendirmenin nereden geldiği. source/rater_role'süz eski satırlar uygulamadan hekim sayılır. */
export function reviewSourceLabel(r: { source?: string | null; rater_role?: string | null }): ReviewSourceLabel {
  if (r.source === 'whatsapp') return r.rater_role === 'clinic' ? 'WhatsApp · klinik hattı' : 'WhatsApp · hekim';
  return r.rater_role === 'clinic' ? 'Klinik' : 'Hekim';
}

/** WhatsApp puan isteği: teslimden kaç gün sonra (lab ayarı). DB 1–14 dışını reddeder. */
export const REVIEW_DELAY_MIN = 1;
export const REVIEW_DELAY_MAX = 14;
export const REVIEW_DELAY_DEFAULT = 3;

/** −/+ adımı; sonuç 1–14 aralığında kalır. Geçersiz değer adım uygulanmadan varsayılana döner. */
export function stepReviewDelayDays(current: number, delta: number): number {
  if (!Number.isFinite(current)) return REVIEW_DELAY_DEFAULT;
  return Math.min(REVIEW_DELAY_MAX, Math.max(REVIEW_DELAY_MIN, Math.round(current) + delta));
}
