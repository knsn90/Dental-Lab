// node --test modules/invoices/lib/invoiceDiscount.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as client from './invoiceDiscount.ts';
import * as edge from '../../../supabase/functions/_shared/invoiceDiscount.ts';

for (const m of [client, edge]) {
  test('tutar', () => {
    assert.equal(m.invoiceDiscountAmount(1000, 'percent', 10), 100);
    assert.equal(m.invoiceDiscountAmount(100.10, 'percent', 15), 15.02); // 15.015 → 15.02
    assert.equal(m.invoiceDiscountAmount(80, 'fixed', 100), 80);
    assert.equal(m.invoiceDiscountAmount(80, null, 5), 0);
    assert.equal(m.invoiceDiscountAmount(80, 'percent', 0), 0);
  });
  test('toplamlar: KDV indirimden sonra', () => {
    assert.deepEqual(m.invoiceTotalsWithDiscount(1000, 20, 'percent', 10), { discount: 100, subtotal: 900, tax: 180, total: 1080 });
    assert.deepEqual(m.invoiceTotalsWithDiscount(1000, 20, null, 0), { discount: 0, subtotal: 1000, tax: 200, total: 1200 });
  });
  test('dağıtım: orantılı, kuruş farkı en büyük satıra, toplam tam', () => {
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 100 }, { key: 'b', net: 200 }], 10), { a: 3.33, b: 6.67 });
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 1 }, { key: 'b', net: 1 }, { key: 'c', net: 1 }], 0.01), { a: 0.01, b: 0, c: 0 });
    assert.deepEqual(m.distributeDiscount([], 5), {});
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 50 }], 0), { a: 0 });
  });
  test('round2: yarım değerler sıfırdan uzağa', () => {
    assert.equal(m.round2(1.005), 1.01);
    assert.equal(m.round2(2.675), 2.68);
    assert.equal(m.round2(0.005), 0.01);
    assert.equal(m.round2(-0.005), -0.01);
    assert.equal(m.round2(-1.005), -1.01);
    assert.equal(m.round2(1.004), 1);
    assert.equal(m.round2(0), 0);
  });
  test('yüzde > 100 kalem toplamını aşmaz', () => {
    assert.equal(m.invoiceDiscountAmount(100, 'percent', 150), 100);
    assert.deepEqual(m.invoiceTotalsWithDiscount(100, 20, 'percent', 150), { discount: 100, subtotal: 0, tax: 0, total: 0 });
  });
  test('dağıtım: yinelenen anahtarlar toplanır', () => {
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 1 }, { key: 'a', net: 2 }], 1), { a: 1 });
  });
  test('dağıtım: sınırlar', () => {
    // indirim satır toplamını aşarsa toplama kırpılır
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 10 }, { key: 'b', net: 5 }], 100), { a: 10, b: 5 });
    // net <= 0 satırlar 0 alır
    assert.deepEqual(m.distributeDiscount([{ key: 'a', net: 0 }, { key: 'b', net: -5 }, { key: 'c', net: 10 }], 4), { a: 0, b: 0, c: 4 });
    // eşitlikte kuruş farkı ilk satıra; toplam tam, pay net'i aşmaz
    const r = m.distributeDiscount([{ key: 'a', net: 0.02 }, { key: 'b', net: 0.02 }, { key: 'c', net: 0.02 }], 0.05);
    const sum = Math.round((r.a + r.b + r.c) * 100);
    assert.equal(sum, 5);
    for (const k of ['a', 'b', 'c']) assert.ok(r[k] <= 0.02);
  });
}
test('iki kopya aynı', () => {
  for (const [n, t, v] of [[999.99, 'percent', 33.3], [12.345, 'fixed', 3], [0, 'percent', 50]] as const)
    assert.deepEqual(client.invoiceTotalsWithDiscount(n, 18, t, v), edge.invoiceTotalsWithDiscount(n, 18, t, v));
});
