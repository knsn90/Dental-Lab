// supabase/functions/_shared/lucaDiscountBalance.ts
//
// Fatura altı indirimi Luca kalemlerine dağıtırken KDV yuvarlaması dengelenir.
// DB faturanın KDV'sini BİR KEZ hesaplar: ROUND((Σnet − indirim) × oran/100, 2).
// Luca ise satır başına hesaplar: Σ r2((net_i − pay_i) × oran/100). Orantılı paylar tek-kuruşlu
// tabanlar üretince iki toplam ayrışır (ör. 850+850+175, %7,5 indirim, %20 KDV: 346,88 ≠ 346,87).
// Bu yardımcı payları (toplam sabit) kuruş kuruş kaydırarak Luca KDV toplamını DB'ninkine eşitler.
// Saf, deterministik (I/O yok). Testler: lucaDiscountBalance.test.ts

import { round2 } from './invoiceDiscount.ts';

/** Bir payın orantılı değerinden en çok sapabileceği miktar (kuruş). */
export const MAX_DEV_CENTS = 10;
const MAX_ITER = 200;

// luca.ts computeTotals ile birebir aynı yuvarlama (r2 = round-half-up + EPSILON).
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Bir satırın KDV'si (kuruş) — computeTotals: r2(lineExtension × oran / 100). */
const lineVatCents = (baseCents: number, ratePct: number) =>
  Math.round(r2(r2(baseCents / 100) * ratePct / 100) * 100);

export type BalanceResult = { ok: true; shares: number[] } | { ok: false };

/**
 * @param nets    satır net tutarları (2 ondalık)
 * @param discount fatura altı indirim tutarı (2 ondalık)
 * @param ratePct KDV oranı (yüzde)
 * Dönüş: satır başına pay (nets ile aynı sıra, 2 ondalık). Garantiler (ok iken):
 *  (a) Σ pay = indirim (kuruş kuruş; indirim net toplamını aşarsa { ok:false })
 *  (b) 0 ≤ pay ≤ net
 *  (c) |pay − orantılı değer| ≤ maxDevCents
 *  (d) Σ lineVat(net − pay) = ROUND((Σnet − indirim) × oran/100, 2)
 */
export function balanceDiscountShares(
  nets: ReadonlyArray<number>,
  discount: number,
  ratePct: number,
  maxDevCents: number = MAX_DEV_CENTS,
): BalanceResult {
  const toC = (x: number) => Math.round(Number((Number(x) * 100).toFixed(6)));
  const n = nets.map((x) => Math.max(0, toC(x)));
  const total = n.reduce((a, b) => a + b, 0);
  const want = Math.max(0, toC(discount));
  if (want > total) return { ok: false }; // indirim net toplamını aşıyorsa kırpıp "başarılı" denmez
  const zero = n.map(() => 0);
  if (want <= 0) return { ok: true, shares: zero.map((x) => x / 100) };

  // Başlangıç: en büyük kalan yöntemi (her pay orantılı değerin 1 kuruş içinde).
  const real = n.map((x) => (want * x) / total);
  const s = real.map((x) => Math.floor(x));
  let left = want - s.reduce((a, b) => a + b, 0);
  const order = n.map((_, i) => i).sort((a, b) => (real[b] - s[b]) - (real[a] - s[a]) || n[b] - n[a] || a - b);
  for (const i of order) { if (left <= 0) break; if (s[i] < n[i]) { s[i]++; left--; } }
  if (left > 0) return { ok: false };

  const lo = n.map((x, i) => Math.max(0, Math.ceil(real[i] - maxDevCents)));
  const hi = n.map((x, i) => Math.min(x, Math.floor(real[i] + maxDevCents)));

  const target = Math.round(round2(((total - want) / 100 * ratePct) / 100) * 100);
  const vat = (i: number, v: number) => lineVatCents(n[i] - v, ratePct);

  for (let it = 0; it < MAX_ITER; it++) {
    const cur = n.reduce((a, _, i) => a + vat(i, s[i]), 0);
    const d = target - cur;
    if (d === 0) return { ok: true, shares: s.map((x) => x / 100) };
    // s[i] −= k, s[j] += k hamlelerinin en çok yaklaştıranı (eşitlikte ilk i, j, k).
    let best: { i: number; j: number; k: number; gap: number } | null = null;
    for (let i = 0; i < n.length; i++) {
      for (let j = 0; j < n.length; j++) {
        if (i === j) continue;
        const kMax = Math.min(s[i] - lo[i], hi[j] - s[j], 2 * maxDevCents);
        const base = vat(i, s[i]) + vat(j, s[j]);
        for (let k = 1; k <= kMax; k++) {
          const delta = vat(i, s[i] - k) + vat(j, s[j] + k) - base;
          const gap = Math.abs(d - delta);
          if (gap < Math.abs(d) && (best === null || gap < best.gap)) best = { i, j, k, gap };
        }
      }
    }
    if (!best) return { ok: false };
    s[best.i] -= best.k;
    s[best.j] += best.k;
  }
  return { ok: false };
}
