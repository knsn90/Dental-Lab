// node --test my-expo-app/supabase/functions/_shared/lucaDiscountBalance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceDiscountShares, MAX_DEV_CENTS } from './lucaDiscountBalance.ts';
import { invoiceTotalsWithDiscount, round2 } from './invoiceDiscount.ts';
import { computeTotals } from './luca.ts';

const cents = (x: number) => Math.round(x * 100);
const lucaVat = (nets: number[], shares: number[], rate: number) =>
  computeTotals(nets.map((n, i) => ({ code: 'x', name: 'x', quantity: 1, unitPrice: n, vatRate: rate, discountAmount: shares[i] }))).vat;

test('850 + 850 + 175, %7,5 indirim, %20 KDV: KDV 346,87, ödenecek 2081,24', () => {
  const nets = [850, 850, 175];
  const t = invoiceTotalsWithDiscount(1875, 20, 'percent', 7.5);
  assert.equal(t.discount, 140.63);
  assert.equal(t.total, 2081.24);
  const r = balanceDiscountShares(nets, t.discount, 20);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(cents(r.shares.reduce((a, b) => a + b, 0)), 14063);
  const c = computeTotals(nets.map((n, i) => ({ code: 'x', name: 'x', quantity: 1, unitPrice: n, vatRate: 20, discountAmount: r.shares[i] })));
  assert.equal(c.vat, 346.87);
  assert.equal(c.payable, 2081.24);
  const real = nets.map((n) => (14063 * n * 100) / 187500);
  r.shares.forEach((s, i) => assert.ok(Math.abs(cents(s) - real[i]) <= MAX_DEV_CENTS, `pay ${i} sapması`));
});

test('net 0 satır 0 pay alır; indirim yok → hepsi 0', () => {
  const r = balanceDiscountShares([0, 100, 200], 10, 20);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.shares[0], 0); assert.equal(cents(r.shares.reduce((a, b) => a + b, 0)), 1000); }
  const z = balanceDiscountShares([100, 200], 0, 20);
  assert.deepEqual(z, { ok: true, shares: [0, 0] });
});

test('±10 kuruş içinde dengelenemeyen durum { ok:false } döner (atmaz)', () => {
  // %1 KDV'de 10 kuruşluk kaydırma satır KDV'sini değiştiremez (ölçülen, kaba kuvvetle doğrulanmış durum).
  assert.deepEqual(balanceDiscountShares([2550, 399.6], 2304.95, 1), { ok: false });
});

test('özellik: 2000+ rastgele fatura — (a)(b)(c)(d) tutar ya da başarısızlık bildirilir; oran ölçülür', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const prices = [1250, 850, 1250.5, 2400, 300, 175, 99.9, 1000, 4500, 650, 33.33, 12.34, 0.01, 0.5, 7.77];
  const N = 6000;
  let fail = 0;
  let failMain = 0, nMain = 0; // KDV %10/18/20
  let maxDev = 0;
  for (let k = 0; k < N; k++) {
    const n = 1 + Math.floor(rnd() * 20);
    const rate = [1, 10, 18, 20][Math.floor(rnd() * 4)];
    const nets = Array.from({ length: n }, () => round2(prices[Math.floor(rnd() * prices.length)] * (1 + Math.floor(rnd() * 4))));
    const sum = round2(nets.reduce((a, b) => a + b, 0));
    const t = rnd() < 0.5
      ? invoiceTotalsWithDiscount(sum, rate, 'percent', [5, 7.5, 10, 12.5, 33.3][Math.floor(rnd() * 5)])
      : invoiceTotalsWithDiscount(sum, rate, 'fixed', round2(rnd() * sum));
    const r = balanceDiscountShares(nets, t.discount, rate);
    if (rate !== 1) nMain++;
    if (!r.ok) { fail++; if (rate !== 1) failMain++; continue; }
    // (a)
    assert.equal(r.shares.reduce((a, s) => a + cents(s), 0), cents(t.discount));
    const tot = nets.reduce((a, x) => a + cents(x), 0);
    r.shares.forEach((s, i) => {
      assert.ok(s >= 0 && cents(s) <= cents(nets[i]), '(b)');                       // (b)
      const dev = Math.abs(cents(s) - (cents(t.discount) * cents(nets[i])) / tot);   // (c)
      maxDev = Math.max(maxDev, dev);
      assert.ok(dev <= MAX_DEV_CENTS + 1e-9, '(c)');
    });
    assert.equal(round2(lucaVat(nets, r.shares, rate)), round2(t.total - t.subtotal), '(d)'); // (d)
  }
  // Ölçüm (tohum 12345, 6000 fatura): tümü 122/6000 (%2,0) — hepsi %1 KDV'de (10 kuruşluk kaydırma satır KDV'sini değiştiremez); %10/18/20'de 0/4420.
  console.log(`dengeleme başarısız: ${fail}/${N}; KDV 10/18/20: ${failMain}/${nMain}; en büyük sapma ${maxDev.toFixed(2)} kuruş`);
  assert.ok(fail / N < 0.05, `toplam başarısızlık oranı ${fail / N}`);
  assert.ok(failMain / nMain < 0.01, `KDV 10/18/20 başarısızlık oranı ${failMain / nMain}`);
});
