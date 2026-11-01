// node --test modules/invoices/lib/statementVat.test.mts — ekstrede KDV ayrımı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vatPortion, statementVatSummary, statementVatByCurrency } from './statementVat.ts';

test('KDV payı faturanın kendi tutarında birebir', () => {
  assert.equal(vatPortion({ total: 120, tax_amount: 20 }, 120), 20);
});

test('baz paraya çevrilmiş tutarda KDV oransal bölünür', () => {
  // 120 EUR fatura (20 KDV) ekstrede 60 baz olarak görünüyorsa KDV payı 10
  assert.equal(vatPortion({ total: 120, tax_amount: 20 }, 60), 10);
});

test('KDV yoksa veya toplam sıfırsa pay 0', () => {
  assert.equal(vatPortion({ total: 100, tax_amount: 0 }, 100), 0);
  assert.equal(vatPortion({ total: 0, tax_amount: 0 }, 0), 0);
  assert.equal(vatPortion({ total: 100, tax_amount: null }, 100), 0);
});

test('özet yalnız fatura satırlarını toplar; KDV hariç + KDV = genel toplam', () => {
  const s = statementVatSummary([
    { type: 'invoice', debit: 120, tax: 20 },
    { type: 'invoice', debit: 50, tax: 0 },
    { type: 'payment', debit: 0, tax: 0 },
    { type: 'invoice', debit: 236, tax: 36 },
  ]);
  assert.deepEqual(s, { net: 350, tax: 56, total: 406 });
});

test('KDV alanı olmayan satır KDV\'siz sayılır', () => {
  assert.deepEqual(statementVatSummary([{ type: 'invoice', debit: 80 }]), { net: 80, tax: 0, total: 80 });
});

test('kuruş artığı yuvarlanır', () => {
  const s = statementVatSummary([
    { type: 'invoice', debit: 0.1, tax: 0.02 },
    { type: 'invoice', debit: 0.2, tax: 0.03 },
  ]);
  assert.deepEqual(s, { net: 0.25, tax: 0.05, total: 0.3 });
});

test('para birimine göre döküm: para birimleri asla toplanmaz', () => {
  const r = statementVatByCurrency([
    { type: 'invoice', debit: 120, tax: 20, currency: 'TRY' },
    { type: 'invoice', debit: 50, tax: 0, currency: 'EUR' },
    { type: 'payment', debit: 0, tax: 0, currency: 'TRY' },
    { type: 'invoice', debit: 236, tax: 36, currency: 'TRY' },
  ]);
  assert.deepEqual(r, [
    { currency: 'TRY', net: 300, tax: 56, total: 356 },
    { currency: 'EUR', net: 50, tax: 0, total: 50 },
  ]);
});

test('faturası olmayan para birimi dökümde yer almaz', () => {
  assert.deepEqual(statementVatByCurrency([{ type: 'payment', debit: 0, currency: 'USD' }]), []);
});
