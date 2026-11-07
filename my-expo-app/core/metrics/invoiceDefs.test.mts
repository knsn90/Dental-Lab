// node --test my-expo-app/core/metrics/invoiceDefs.test.mts   (.mts → tsc kapsamı dışında)
// Fatura tanımlarının istemci aynası; SQL karşılığı: v_clinic_balance(_ccy), finance_period_metrics (20261026100000).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSTED_INVOICE_STATUSES, isPostedInvoice, isInvoiceOverdue, isStatementPayment } from './invoiceDefs.ts';

test('kesilmiş fatura: taslak ve iptal hariç', () => {
  assert.deepEqual([...POSTED_INVOICE_STATUSES], ['kesildi', 'kismi_odendi', 'odendi']);
  assert.equal(isPostedInvoice({ status: 'taslak' }), false);
  assert.equal(isPostedInvoice({ status: 'iptal' }), false);
  assert.equal(isPostedInvoice({ status: 'kismi_odendi' }), true);
});

test('vadesi geçmiş fatura: kesilmiş, kalanı var, vade bugünden önce', () => {
  const T = '2026-10-26';
  const f = (status: string, due: string | null, total = 100, paid = 0) => ({ status, due_date: due, total, paid_amount: paid });
  assert.equal(isInvoiceOverdue(f('kesildi', '2026-10-25'), T), true);
  assert.equal(isInvoiceOverdue(f('kesildi', '2026-10-26'), T), false);       // bugün vadeli → henüz değil
  assert.equal(isInvoiceOverdue(f('taslak', '2026-10-01'), T), false);        // taslak alacak değil
  assert.equal(isInvoiceOverdue(f('iptal', '2026-10-01'), T), false);
  assert.equal(isInvoiceOverdue(f('odendi', '2026-10-01', 100, 100), T), false);
  assert.equal(isInvoiceOverdue(f('kismi_odendi', '2026-10-01', 100, 40), T), true);
  assert.equal(isInvoiceOverdue(f('kesildi', null), T), false);
});

test('ekstre ödemesi: yalnız kesilmiş faturanın ödemesi (v_clinic_balance_ccy ile aynı)', () => {
  assert.equal(isStatementPayment({ invoices: { status: 'kesildi' } }), true);
  assert.equal(isStatementPayment({ invoices: { status: 'odendi' } }), true);
  assert.equal(isStatementPayment({ invoices: { status: 'kismi_odendi' } }), true);
  assert.equal(isStatementPayment({ invoices: { status: 'iptal' } }), false);
  assert.equal(isStatementPayment({ invoices: { status: 'taslak' } }), false);
  // durum gelmezse (eski seçim) dışlanmaz
  assert.equal(isStatementPayment({ invoices: {} }), true);
  assert.equal(isStatementPayment({ invoices: null }), true);
  assert.equal(isStatementPayment({}), true);
});
