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
