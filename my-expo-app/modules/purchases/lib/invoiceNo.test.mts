// node --test my-expo-app/modules/purchases/lib/invoiceNo.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvoiceNo, isDuplicatePurchaseError } from './invoiceNo.ts';

test('yazım farkları aynı numara', () => {
  assert.equal(normalizeInvoiceNo(' ftr 001 '), 'FTR001');
  assert.equal(normalizeInvoiceNo('FTR-001'), 'FTR001');
  assert.equal(normalizeInvoiceNo('ftr/001'), 'FTR001');
  assert.equal(normalizeInvoiceNo('FTR.001_A'), 'FTR001A');
});

test('i / I / İ / ı aynı harf sayılır (tr büyük harf tuzağı)', () => {
  assert.equal(normalizeInvoiceNo('ifa-12'), 'IFA12');
  assert.equal(normalizeInvoiceNo('inv-2026-001'), normalizeInvoiceNo('INV-2026-001'));
  assert.equal(normalizeInvoiceNo('gib2026'), normalizeInvoiceNo('GIB2026'));
  assert.equal(normalizeInvoiceNo('İrsaliye 5'), 'IRSALIYE5');
  assert.equal(normalizeInvoiceNo('ırmak-7'), 'IRMAK7');
});

test('boş', () => {
  assert.equal(normalizeInvoiceNo(''), '');
  assert.equal(normalizeInvoiceNo(null), '');
  assert.equal(normalizeInvoiceNo(undefined), '');
  assert.equal(normalizeInvoiceNo('  '), '');
  assert.equal(normalizeInvoiceNo(' - / '), '');
});

test('isDuplicatePurchaseError: yalnız mükerrer-fatura benzersizlik ihlali', () => {
  assert.equal(isDuplicatePurchaseError({ code: '23505', message: 'duplicate key value violates unique constraint "purchase_invoices_lab_supplier_no_uq"' }), true);
  assert.equal(isDuplicatePurchaseError({ code: '23505', message: 'duplicate key value violates unique constraint "purchase_invoices_lab_efatura_ettn_uq"' }), false);
  assert.equal(isDuplicatePurchaseError({ code: 'P0001', message: 'purchase_invoices_lab_supplier_no_uq' }), false);
  assert.equal(isDuplicatePurchaseError({ message: 'network error' }), false);
  assert.equal(isDuplicatePurchaseError(null), false);
  assert.equal(isDuplicatePurchaseError(undefined), false);
});
