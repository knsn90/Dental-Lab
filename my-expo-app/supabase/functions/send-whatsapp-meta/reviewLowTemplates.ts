// Düşük puan lab şablonları (spec 2026-11-04 §14). Saf modül: Deno/esm.sh içe aktarmaz; node --test ile sınanır.
// Değişken adları Meta'daki şablonlarla BİREBİR. Payload'ı _review_low_alert (DB) doldurur:
// orderNumber, clinic (kliniği yoksa hekimin adı), doctor, workType, scores. Hasta adı ve yorum YOK.
// Ham metin döner; index.ts her değeri clean()'den geçirir.

export type ReviewLowCategory = 'review_low' | 'review_low_reminder';

export const REVIEW_LOW_TEMPLATE_NAMES: Record<ReviewLowCategory, string> = {
  review_low: 'dusuk_puan_lab',
  review_low_reminder: 'dusuk_puan_hatirlatma',
};

const val = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return s.length ? s : '—';
};

export function reviewLowLabParams(category: ReviewLowCategory, p: Record<string, unknown>): { name: string; text: string }[] {
  if (category === 'review_low_reminder') {
    return [
      { name: 'siparis_no', text: val(p.orderNumber) },
      { name: 'klinik', text: val(p.clinic) },
    ];
  }
  return [
    { name: 'siparis_no', text: val(p.orderNumber) },
    { name: 'is_turu', text: val(p.workType) },
    { name: 'hekim', text: val(p.doctor) },
    { name: 'klinik', text: val(p.clinic) },
    { name: 'puanlar', text: val(p.scores) },
  ];
}
