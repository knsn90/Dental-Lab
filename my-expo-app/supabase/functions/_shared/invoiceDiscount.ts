// Fatura altı indirim: saf hesap kuralları.
// DİKKAT: Bu dosyanın AYNI içerikli bir kopyası supabase/functions/_shared/invoiceDiscount.ts
// içinde durur (edge fonksiyonları istemci modüllerini içe aktaramaz). İkisi birlikte değişir;
// SQL karşılığı (Görev 10) da aynı kuralı izler. Deno'ya özgü içe aktarma yok.

export type InvoiceDiscountType = 'percent' | 'fixed' | null;

/**
 * SQL ROUND(x, 2) ile aynı: yarım değerler sıfırdan uzağa, kuruş tamsayısı üzerinden.
 * Kayan nokta payı: 100.10*15/100 = 15.014999… olur; SQL numeric 15.015 → 15.02 verir.
 * Çözüm: |x|*100 değerini 6 ondalığa sabitleyip (toFixed) sonra Math.round (yarım yukarı) yapmak;
 * işaret ayrı taşındığı için negatifte de sıfırdan uzağa yuvarlanır.
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
  const d = type === 'percent' ? round2((net * v) / 100) : Math.min(v, net);
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
  lines.forEach((l, i) => { out[l.key] = shares[i] / 100; });
  return out;
}
