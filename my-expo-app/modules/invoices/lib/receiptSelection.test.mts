// node --test modules/invoices/lib/receiptSelection.test.mts — tahsilatta elle fatura seçimi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleSelection, pruneSelection, receiptErrorText, selectableInvoices,
} from './receiptSelection.ts';

const inv = (id: string, currency = 'TRY') =>
  ({ invoice_id: id, invoice_no: id, currency, open: 10, issue_date: null, due_date: null });

test('toggleSelection: yeni seçim sona eklenir, sıra korunur', () => {
  assert.deepEqual(toggleSelection(['a', 'b'], 'c'), ['a', 'b', 'c']);
});
test('toggleSelection: tekrar seçilen çıkar', () => {
  assert.deepEqual(toggleSelection(['a', 'b', 'c'], 'b'), ['a', 'c']);
});
test('toggleSelection: girdiyi değiştirmez', () => {
  const src = ['a'];
  toggleSelection(src, 'b');
  assert.deepEqual(src, ['a']);
});
test('pruneSelection: artık açık olmayanı atar', () => {
  assert.deepEqual(pruneSelection(['a', 'x'], [inv('a')]), ['a']);
});
test('pruneSelection: sırayı korur', () => {
  assert.deepEqual(pruneSelection(['b', 'a'], [inv('a'), inv('b')]), ['b', 'a']);
});
test('receiptErrorText: geçersiz fatura kodu okunur metne döner', () => {
  assert.equal(receiptErrorText('P0001: RCPT_INVOICE_INVALID: x'), 'Seçilen fatura artık açık değil');
});
test('receiptErrorText: başka hata null', () => {
  assert.equal(receiptErrorText('başka'), null);
});
test('selectableInvoices: yalnız satır para birimindeki açık faturalar', () => {
  const open = [inv('a', 'TRY'), inv('b', 'EUR'), inv('c', 'USD')];
  assert.deepEqual(selectableInvoices(open, ['TRY', 'USD']).map(i => i.invoice_id), ['a', 'c']);
});
test('selectableInvoices: satır yoksa liste boş', () => {
  assert.deepEqual(selectableInvoices([inv('a')], []), []);
});
