// node --test my-expo-app/modules/efatura/lib/bulkGroups.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBulkEInvoices, filterGroups } from './bulkGroups.ts';

const r = (id: string, ettn: string | null, over: Record<string, unknown> = {}) => ({
  id, invoice_number: `FTR-${id}`, issue_date: '2026-09-01', total: 10, currency: 'EUR', status: 'kesildi',
  efatura_uuid: ettn, efatura_number: ettn ? `NEX-${ettn}` : null, efatura_status: 'sent', efatura_type: 'e_fatura',
  efatura_sent_at: '2026-10-20T10:00:00Z', clinic_name: 'Luna', clinic_logo: null, ...over,
});

test('aynı ETTN\'li en az iki fatura = bir toplu e-fatura; tekli ve e-faturasızlar dışarıda', () => {
  const g = groupBulkEInvoices([
    r('1', 'A', { issue_date: '2026-09-02', total: 38.5 }), r('2', 'A', { issue_date: '2026-06-19', total: 115.25 }),
    r('3', 'B'),                                  // tek fatura → toplu değil
    r('4', null),                                 // e-faturasız
    r('5', 'C', { efatura_sent_at: '2026-10-21T09:00:00Z', clinic_name: 'Melis' }), r('6', 'C', { efatura_sent_at: '2026-10-21T09:00:00Z', clinic_name: 'Melis' }),
  ]);
  assert.deepEqual(g.map((x) => x.ettn), ['c', 'a']);           // en yeni önce; anahtar küçük harf
  const a = g[1];
  assert.equal(a.number, 'NEX-A');
  assert.equal(a.total, 153.75);
  assert.equal(a.clinicName, 'Luna');
  assert.deepEqual(a.invoices.map((i) => i.invoice_number), ['FTR-2', 'FTR-1']);   // fatura tarihine göre
  assert.equal(a.firstDate, '2026-06-19');
  assert.equal(a.lastDate, '2026-09-02');
});

test('ETTN büyük/küçük harf farkı aynı grup sayılır', () => {
  assert.equal(groupBulkEInvoices([r('1', 'abc'), r('2', 'ABC')]).length, 1);
});

test('arama: e-fatura no, klinik, Siman fatura no', () => {
  const g = groupBulkEInvoices([r('1', 'A'), r('2', 'A'), r('3', 'C', { clinic_name: 'Melis' }), r('4', 'C', { clinic_name: 'Melis' })]);
  assert.deepEqual(filterGroups(g, 'melis').map((x) => x.ettn), ['c']);
  assert.deepEqual(filterGroups(g, 'nex-a').map((x) => x.ettn), ['a']);
  assert.deepEqual(filterGroups(g, 'ftr-4').map((x) => x.ettn), ['c']);
  assert.equal(filterGroups(g, '  ').length, 2);
});
