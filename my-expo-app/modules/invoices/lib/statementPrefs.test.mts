// node --test modules/invoices/lib/statementPrefs.test.mts — ekstre liste ayarı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATEMENT_PREFS, parseStatementPrefs, applyStatementPrefs } from './statementPrefs.ts';

const inv = {
  type: 'invoice' as const, description: 'Hasta A — F-NEX-2026-0001', invoiceNo: 'F-NEX-2026-0001',
  patientName: 'Hasta A', orderNo: 'NEX-2026-0001', doctorName: 'Dt. B',
  status: 'kesildi', revisionOf: 'NEX-2026-0000', revisionResponsible: 'lab',
  tax: 20, taxRate: 20, debit: 120, credit: 0, balance: 120,
};
const pay = {
  type: 'payment' as const, description: 'Tahsilat', invoiceNo: undefined,
  patientName: null, orderNo: null, doctorName: null,
  debit: 0, credit: 100, balance: 20,
};

test('varsayılan: her şey açık, satırlar aynen kalır', () => {
  assert.deepEqual(DEFAULT_STATEMENT_PREFS, { vat: true, details: true, payments: true, status: true, discountMode: 'amount' });
  assert.deepEqual(applyStatementPrefs([inv, pay], DEFAULT_STATEMENT_PREFS), [inv, pay]);
});

test('tahsilat kapalı: yalnız faturalar, yürüyen bakiye değişmez', () => {
  const r = applyStatementPrefs([inv, pay], { ...DEFAULT_STATEMENT_PREFS, payments: false });
  assert.equal(r.length, 1);
  assert.equal(r[0].balance, 120);
});

test('hasta/sipariş/hekim kapalı: alanlar boşalır, açıklama fatura no olur', () => {
  const [r] = applyStatementPrefs([inv], { ...DEFAULT_STATEMENT_PREFS, details: false });
  assert.equal(r.patientName, null);
  assert.equal(r.orderNo, null);
  assert.equal(r.doctorName, null);
  assert.equal(r.description, 'F-NEX-2026-0001');
  assert.equal(r.debit, 120);
});

test('durum kapalı: durum etiketi ve revizyon notu boşalır', () => {
  const [r] = applyStatementPrefs([inv], { ...DEFAULT_STATEMENT_PREFS, status: false });
  assert.equal(r.status, undefined);
  assert.equal(r.revisionOf, null);
  assert.equal(r.revisionResponsible, null);
});

test('KDV kapalı: KDV alanları boşalır, tutar aynen', () => {
  const [r] = applyStatementPrefs([inv], { ...DEFAULT_STATEMENT_PREFS, vat: false });
  assert.equal(r.tax, undefined);
  assert.equal(r.taxRate, undefined);
  assert.equal(r.debit, 120);
});

test('kayıt okuma: bozuk/eksik veri varsayılana düşer, bilinmeyen anahtar atılır', () => {
  assert.deepEqual(parseStatementPrefs(null), DEFAULT_STATEMENT_PREFS);
  assert.deepEqual(parseStatementPrefs('{bozuk'), DEFAULT_STATEMENT_PREFS);
  assert.deepEqual(parseStatementPrefs('{"vat":false,"x":1}'), { ...DEFAULT_STATEMENT_PREFS, vat: false });
  assert.deepEqual(parseStatementPrefs('{"payments":"evet"}'), DEFAULT_STATEMENT_PREFS);
});

test('discountMode okunur, geçersiz değer varsayılana döner', () => {
  assert.equal(parseStatementPrefs(JSON.stringify({ discountMode: 'percent' })).discountMode, 'percent');
  assert.equal(parseStatementPrefs(JSON.stringify({ discountMode: 'x' })).discountMode, 'amount');
  assert.equal(parseStatementPrefs(JSON.stringify({ vat: true })).discountMode, 'amount');
});
test('tahsilat satırları kapalıyken indirim satırı kalır', () => {
  const p = { ...DEFAULT_STATEMENT_PREFS, payments: false };
  assert.deepEqual(applyStatementPrefs([{ type: 'payment' }, { type: 'discount' }, { type: 'invoice' }] as any, p).map((l: any) => l.type), ['discount', 'invoice']);
});
