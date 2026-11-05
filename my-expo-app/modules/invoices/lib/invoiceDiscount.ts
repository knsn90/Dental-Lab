// Fatura altı indirim: saf hesap kuralları.
// DİKKAT: istemci kopyası ile edge kopyası bayt bayt aynı kalmalıdır:
// modules/invoices/lib/invoiceDiscount.ts ↔ supabase/functions/_shared/invoiceDiscount.ts
// (edge fonksiyonları istemci modüllerini içe aktaramaz). SQL karşılığı (Görev 10) da aynı kuralı izler.
// Deno'ya özgü içe aktarma yok.

export type InvoiceDiscountType = 'percent' | 'fixed' | null;

/**
 * SQL ROUND(x, 2) ile aynı: yarım değerler sıfırdan uzağa, kuruş tamsayısı üzerinden.
 * Kayan nokta payı: 100.10*15/100 = 15.014999… olur; SQL numeric 15.015 → 15.02 verir.
 * Çözüm: |x|*100 değerini 6 ondalığa sabitleyip (toFixed) sonra Math.round (yarım yukarı) yapmak;
 * işaret ayrı taşındığı için negatifte de sıfırdan uzağa yuvarlanır.
 * Varsayım: girdiler en çok 4 ondalıklı veriden gelir; toFixed(6) 7+ ardışık 9'lu değerleri yanlış yuvarlayabilir.
 */
export function round2(x: number): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  const cents = Math.round(Number((Math.abs(n) * 100).toFixed(6)));
  return (Math.sign(n) * cents) / 100 || 0;
}

const toCents = (x: number): number => Math.round(Number((Number(x) * 100).toFixed(6)));

export function invoiceDiscountAmount(itemsNet: number, type: InvoiceDiscountType, value: number): number {
  const net = Number(itemsNet) || 0;
  const v = Number(value) || 0;
  if (!type || v <= 0 || net <= 0) return 0;
  const d = type === 'percent' ? Math.min(net, round2((net * v) / 100)) : Math.min(v, net);
  return Math.max(0, round2(d));
}

export function invoiceTotalsWithDiscount(
  itemsNet: number,
  taxRate: number,
  type: InvoiceDiscountType,
  value: number,
): { discount: number; subtotal: number; tax: number; total: number } {
  const net = round2(Number(itemsNet) || 0);
  const discount = invoiceDiscountAmount(net, type, value);
  const subtotal = round2(net - discount);
  const tax = round2((subtotal * (Number(taxRate) || 0)) / 100);
  return { discount, subtotal, tax, total: round2(subtotal + tax) };
}

/**
 * İndirimi satırlara net tutarları oranında dağıtır (kuruş tamsayısıyla).
 * Her pay aşağı yuvarlanır; artan kuruşlar en büyük net'li satırdan başlayarak (eşitlikte ilk satır)
 * verilir, hiçbir pay satır net'ini aşmaz (aşacaksa kalan sıradaki büyük satıra taşar).
 * net <= 0 satırlar 0 alır. İndirim net toplamını aşarsa toplama kırpılır.
 */
export function distributeDiscount(
  lines: ReadonlyArray<{ key: string; net: number }>,
  discount: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const nets = lines.map((l) => Math.max(0, toCents(l.net)));
  const total = nets.reduce((a, b) => a + b, 0);
  const want = Math.min(Math.max(0, toCents(discount)), total); // net toplamını aşan indirim kırpılır
  const shares = nets.map(() => 0);
  if (total > 0 && want > 0) {
    for (let i = 0; i < nets.length; i++) shares[i] = Math.floor((want * nets[i]) / total);
    let left = want - shares.reduce((a, b) => a + b, 0);
    const order = nets.map((_, i) => i).sort((a, b) => nets[b] - nets[a] || a - b);
    for (const i of order) {
      if (left <= 0) break;
      const give = Math.min(left, nets[i] - shares[i]);
      shares[i] += give;
      left -= give;
    }
  }
  const acc: Record<string, number> = {}; // yinelenen anahtarlar kuruş olarak toplanır
  lines.forEach((l, i) => { acc[l.key] = (acc[l.key] ?? 0) + shares[i]; });
  for (const k of Object.keys(acc)) out[k] = acc[k] / 100;
  return out;
}

/**
 * Kullanıcının yazdığı indirim değerini sayıya çevirir (Türkçe giriş):
 * virgül varsa noktalar binlik ayırıcıdır ("1.250,50" → 1250.5, "7,5" → 7.5);
 * virgül yoksa ve yalnız 3'lü nokta grupları varsa yine binliktir ("1.250" → 1250);
 * aksi halde olduğu gibi ("1.25" → 1.25). Boş → 0; sayı değilse NaN.
 */
export function parseDiscountInput(raw: string): number {
  let s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (s === '') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/**
 * Fatura indirimi alanı doğrulaması (create_bulk_invoice INV_DISCOUNT_VALUE kuralıyla aynı).
 * Boş → { ok, value: 0 } (indirim yok). Hata metinleri Türkçe kaynak; arayüz autoT() ile sarar.
 */
export function validateInvoiceDiscount(
  type: InvoiceDiscountType,
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } {
  if (String(raw ?? '').trim() === '') return { ok: true, value: 0 };
  const v = parseDiscountInput(raw);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "İndirim 0'dan büyük olmalı." };
  if (!type) return { ok: false, error: 'İndirim türü seçin.' };
  if (type === 'percent' && v > 100) return { ok: false, error: "Yüzde 100'ü aşamaz." };
  return { ok: true, value: v };
}

/**
 * create_bulk_invoice indirim hatalarını alan metnine çevirir; indirimle ilgisiz hata → null.
 * INV_DISCOUNT_VALUE (22023) → validateInvoiceDiscount metni; 'Yetkiniz yok' (42501) olduğu gibi.
 */
export function invoiceDiscountRpcError(
  message: string | null | undefined,
  type: InvoiceDiscountType,
  raw: string,
): string | null {
  const msg = String(message ?? '');
  if (msg.includes('INV_DISCOUNT_VALUE')) {
    const r = validateInvoiceDiscount(type, raw);
    return r.ok ? "İndirim 0'dan büyük olmalı." : r.error;
  }
  if (msg.includes('Yetkiniz yok')) return 'Yetkiniz yok';
  return null;
}
