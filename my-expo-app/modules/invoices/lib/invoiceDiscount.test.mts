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
  test('alan doğrulaması: validateInvoiceDiscount', () => {
    assert.deepEqual(m.validateInvoiceDiscount(null, ''), { ok: true, value: 0 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', ''), { ok: true, value: 0 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '   '), { ok: true, value: 0 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', '7,5'), { ok: true, value: 7.5 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', '100'), { ok: true, value: 100 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', '101'), { ok: false, error: "Yüzde 100'ü aşamaz." });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '0'), { ok: false, error: "İndirim 0'dan büyük olmalı." });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '-5'), { ok: false, error: "İndirim 0'dan büyük olmalı." });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', 'abc'), { ok: false, error: "İndirim 0'dan büyük olmalı." });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '12abc'), { ok: false, error: "İndirim 0'dan büyük olmalı." });
  });
  test('alan doğrulaması: binlik nokta ve ondalık virgül', () => {
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '1.250'), { ok: true, value: 1250 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '1.250,50'), { ok: true, value: 1250.5 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '12.345.678'), { ok: true, value: 12345678 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '1250,5'), { ok: true, value: 1250.5 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '1.25'), { ok: true, value: 1.25 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '1250.50'), { ok: true, value: 1250.5 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', ' 150 '), { ok: true, value: 150 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', '1.250'), { ok: false, error: "Yüzde 100'ü aşamaz." });
    assert.equal(m.parseDiscountInput('1.250'), 1250);
    assert.ok(Number.isNaN(m.parseDiscountInput('1,2,3')));
  });
  test('alan doğrulaması: tür yokken değer yazılırsa', () => {
    assert.deepEqual(m.validateInvoiceDiscount(null, '5'), { ok: false, error: 'İndirim türü seçin.' });
  });
  test('RPC hatası eşlemesi: invoiceDiscountRpcError', () => {
    assert.equal(m.invoiceDiscountRpcError('INV_DISCOUNT_VALUE', 'percent', '150'), "Yüzde 100'ü aşamaz.");
    assert.equal(m.invoiceDiscountRpcError('INV_DISCOUNT_VALUE', 'fixed', '0'), "İndirim 0'dan büyük olmalı.");
    assert.equal(m.invoiceDiscountRpcError('INV_DISCOUNT_VALUE', 'fixed', '25'), "İndirim 0'dan büyük olmalı.");
    assert.equal(m.invoiceDiscountRpcError('Yetkiniz yok', 'fixed', '25'), 'Yetkiniz yok');
    assert.equal(m.invoiceDiscountRpcError('Tüm siparişler aynı kliniğe ve laboratuvara ait olmalı', 'fixed', '25'), null);
    assert.equal(m.invoiceDiscountRpcError(null, null, ''), null);
  });
  test('alan doğrulaması: Farsça/Arapça rakamlar', () => {
    assert.deepEqual(m.validateInvoiceDiscount('percent', '٧٫٥'), { ok: true, value: 7.5 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '۱۲۵۰'), { ok: true, value: 1250 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '۱٬۲۵۰٫۵'), { ok: true, value: 1250.5 });
    assert.deepEqual(m.validateInvoiceDiscount('fixed', '۱.۲۵۰'), { ok: true, value: 1250 });
    assert.deepEqual(m.validateInvoiceDiscount('percent', '۱۰۱'), { ok: false, error: "Yüzde 100'ü aşamaz." });
    assert.equal(m.parseDiscountInput('٠'), 0);
  });
}
test('iki kopya aynı', () => {
  for (const [n, t, v] of [[999.99, 'percent', 33.3], [12.345, 'fixed', 3], [0, 'percent', 50]] as const)
    assert.deepEqual(client.invoiceTotalsWithDiscount(n, 18, t, v), edge.invoiceTotalsWithDiscount(n, 18, t, v));
});
