// Düzeltme belgesi (DZ) — saf kurallar. Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.
// Yerel içe aktarma yalnız `import type` olabilir (node --test .mts doğrudan çalıştırır).

export type DzErrorCode = 'DZ_VALUE' | 'DZ_CAP' | 'DZ_REASON';

/** SQL ROUND(x,2) ile aynı: yarım değerler sıfırdan uzağa. */
function round2(x: number): number {
  const n = Number(x) || 0;
  const r = Math.round(Number((Math.abs(n) * 100).toFixed(6))) / 100;
  return n < 0 ? -r : r;
}

export function correctionDocNo(n: number): string {
  return 'DZ-' + n;
}

/** Kalemin DZ ile yazılabilecek kalan tutarı. */
export function correctionCap(itemNetTotal: number, priorOnItem: number): number {
  return Math.max(0, round2((Number(itemNetTotal) || 0) - (Number(priorOnItem) || 0)));
}

/** Kalemin fatura toplamındaki payı: round(net × fatura toplamı / Σ kalem net, 2). Fatura altı indirim ve KDV
 *  kalemlere net payları oranında dağılır (SQL record_correction_document ve _profit_revenue_lines ile aynı oran).
 *  Kalem toplamı 0 ise 0 (SQL NULLIF → 0). */
export function correctionItemShare(itemNetTotal: number, invoiceTotal: number, sumNetTotal: number): number {
  const sum = Number(sumNetTotal) || 0;
  if (!(sum > 0)) return 0;
  return round2(((Number(itemNetTotal) || 0) * (Number(invoiceTotal) || 0)) / sum);
}

/** DZ'nin yazılabileceği en büyük tutar: kalem payı − kalemdeki DZ'ler; ayrıca fatura toplamı − faturadaki tüm DZ'ler. */
export function correctionMaxAmount(p: {
  itemNetTotal: number; invoiceTotal: number; sumNetTotal: number; priorOnItem: number; priorOnInvoice: number;
}): number {
  const share = correctionItemShare(p.itemNetTotal, p.invoiceTotal, p.sumNetTotal);
  const invoiceLeft = Math.max(0, round2((Number(p.invoiceTotal) || 0) - (Number(p.priorOnInvoice) || 0)));
  return Math.min(correctionCap(share, p.priorOnItem), invoiceLeft);
}

/** DZ tutarının faturanın açık kısmına giden ve alacağa dönen payı. */
export function correctionSplit(p: { invoiceTotal: number; paidAmount: number; amount: number }): { toInvoice: number; toCredit: number } {
  const amount = round2(p.amount);
  const open = Math.max(0, round2((Number(p.invoiceTotal) || 0) - (Number(p.paidAmount) || 0)));
  const toInvoice = Math.min(amount, open);
  return { toInvoice, toCredit: round2(amount - toInvoice) };
}

export function validateCorrection(p: { amount: number; reason: string; cap: number }): DzErrorCode | null {
  const amount = round2(p.amount);
  if (!(amount > 0)) return 'DZ_VALUE';
  if (amount > round2(Number(p.cap) || 0)) return 'DZ_CAP';
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

const DZ_GENERIC = 'Düzeltme belgesi kaydedilemedi.';

/** Bilinen kod → metin; bilinmeyen DZ_/SD_ kodu ya da 'error' → genel metin; kodsuz sunucu mesajı
 *  (ör. 'Yetkiniz yok') olduğu gibi döner (çağıran autoT ile sarar). */
export function dzErrorText(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  if (!c || c === 'error') return DZ_GENERIC;
  if (Object.prototype.hasOwnProperty.call(DZ_TEXTS, c)) return DZ_TEXTS[c];
  if (/^(DZ|SD)_[A-Z_]+$/.test(c)) return DZ_GENERIC;
  return c;
}

export function isCorrectionShare(p: { payment_method: string; notes?: string | null }): boolean {
  return p.payment_method === 'indirim' && /^DZ-\d+$/.test(p.notes ?? '');
}

type EffInvoice = {
  id: string;
  status: string;
  payments?: ReadonlyArray<{ statement_discount_id?: string | null; amount: number | string }> | null;
};
type EffDiscount = { id: string; doc_type?: string | null; invoice_id?: string | null; amount: number | string };

/** Ekstre indiriminin ETKİN tutarı — SQL v_statement_discount_effective ile aynı kural:
 *  İND ya da faturası iptal olmayan DZ → tutar aynen; faturası iptal DZ ("boş") → yalnız iptal olmayan
 *  faturalara zaten uygulanmış payları (yeni alacak doğurmaz). Faturası listede yoksa tutar aynen. */
export function effectiveDiscountAmount(d: EffDiscount, invoices: ReadonlyArray<EffInvoice>): number {
  const nominal = Number(d.amount) || 0;
  if ((d.doc_type ?? 'IND') !== 'DZ' || !d.invoice_id) return nominal;
  const inv = invoices.find(i => i.id === d.invoice_id);
  if (!inv || inv.status !== 'iptal') return nominal;
  let applied = 0;
  for (const i of invoices) {
    if (i.status === 'iptal') continue;
    for (const p of i.payments ?? []) if (p.statement_discount_id === d.id) applied += Number(p.amount) || 0;
  }
  return round2(applied);
}

/** Ekstre/PDF/Excel girdisi: tutarlar etkin tutara çevrilir; etkin tutarı 0 olan boş DZ satırı düşer
 *  (iptal faturası da ekstrede yoktur). */
export function withEffectiveDiscounts<T extends EffDiscount>(discounts: ReadonlyArray<T>, invoices: ReadonlyArray<EffInvoice>): T[] {
  const out: T[] = [];
  for (const d of discounts) {
    const amount = effectiveDiscountAmount(d, invoices);
    if (amount === (Number(d.amount) || 0) && typeof d.amount === 'number') { out.push(d); continue; }
    if ((d.doc_type ?? 'IND') === 'DZ' && amount <= 0) continue;
    out.push({ ...d, amount });
  }
  return out;
}
