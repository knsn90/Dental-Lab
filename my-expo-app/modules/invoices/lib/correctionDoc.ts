// Düzeltme belgesi (DZ) — saf kurallar. Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.
// Yerel içe aktarma yalnız `import type` olabilir (node --test .mts doğrudan çalıştırır).

export type DzErrorCode = 'DZ_VALUE' | 'DZ_CAP' | 'DZ_REASON';

/** SQL ROUND(x,2) ile aynı: yarım değerler sıfırdan uzağa. */
function round2(x: number): number {
  const n = Number(x) || 0;
  const r = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  return n < 0 ? -r : r;
}

export function correctionDocNo(n: number): string {
  return 'DZ-' + n;
}

/** Kalemin DZ ile yazılabilecek kalan tutarı. */
export function correctionCap(itemNetTotal: number, priorOnItem: number): number {
  return Math.max(0, round2((Number(itemNetTotal) || 0) - (Number(priorOnItem) || 0)));
}

/** DZ tutarının faturanın açık kısmına giden ve alacağa dönen payı. */
export function correctionSplit(p: { invoiceTotal: number; paidAmount: number; amount: number }): { toInvoice: number; toCredit: number } {
  const amount = round2(p.amount);
  const open = Math.max(0, round2((Number(p.invoiceTotal) || 0) - (Number(p.paidAmount) || 0)));
  const toInvoice = Math.min(amount, open);
  return { toInvoice, toCredit: round2(amount - toInvoice) };
}

export function validateCorrection(p: { amount: number; reason: string; cap: number }): DzErrorCode | null {
  const amount = Number(p.amount) || 0;
  if (!(amount > 0)) return 'DZ_VALUE';
  if (round2(amount) > round2(Number(p.cap) || 0)) return 'DZ_CAP';
  if (!String(p.reason ?? '').trim()) return 'DZ_REASON';
  return null;
}

const DZ_TEXTS: Record<string, string> = {
  DZ_VALUE: "Tutar 0'dan büyük olmalı.",
  DZ_CAP: 'Tutar, kalemin kalan tutarını aşamaz.',
  DZ_REASON: 'Gerekçe zorunludur.',
  DZ_STATUS: 'Düzeltme belgesi yalnız kesilmiş faturaya yazılır.',
  DZ_DELETE_LOCKED: 'Düzeltme belgesi silinemez. Fazla yazıldıysa ek fatura kesin.',
  DZ_IDEMPOTENCY_CONFLICT: 'Bu kayıt zaten farklı bilgilerle yapılmış. Sayfayı yenileyin.',
};

export function dzErrorText(code: string | null | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(DZ_TEXTS, code)) return DZ_TEXTS[code];
  return 'Düzeltme belgesi kaydedilemedi.';
}

export function isCorrectionShare(p: { payment_method: string; notes?: string | null }): boolean {
  return p.payment_method === 'indirim' && /^DZ-\d+$/.test(p.notes ?? '');
}
