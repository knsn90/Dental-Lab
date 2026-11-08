// node --test modules/invoices/lib/receiptStatement.test.mts — tahsilat fişinin ekstre alacağı (cari hesap)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptCreditForCurrency } from './receiptStatement.ts';

const rcpt = { id: 'r1', base_currency: 'EUR', total_base: 294.63, allocated_base: 294.63 };
const inv = (currency: string, payments: { receipt_id: string | null; amount: number }[], status = 'odendi') =>
  ({ currency, status, payments });

test('TL faturalara dağıtılan TL tahsilat, TL ekstresinde tek alacak satırı (fatura parasıyla)', () => {
  const invs = [
    inv('TRY', [{ receipt_id: 'r1', amount: 6380 }]),
    inv('TRY', [{ receipt_id: 'r1', amount: 8250 }]),
    inv('TRY', [{ receipt_id: 'r1', amount: 1815 }]),
  ];
  assert.equal(receiptCreditForCurrency(rcpt, invs, 'TRY'), 16445);
});

test('aynı tahsilat baz (EUR) ekstresinde görünmez: EUR faturaya dağıtım ve artan alacak yok', () => {
  assert.equal(receiptCreditForCurrency(rcpt, [inv('EUR', [])], 'EUR'), 0);
});

test('dağıtılmamış alacak yalnız baz para birimi ekstresinde', () => {
  const r2 = { ...rcpt, id: 'r2', total_base: 300, allocated_base: 294.63 };
  assert.equal(receiptCreditForCurrency(r2, [], 'EUR'), 5.37);
  assert.equal(receiptCreditForCurrency(r2, [], 'TRY'), 0);
});

test('başka makbuzun, makbuzsuz ödemenin ve başka para birimindeki faturanın ödemesi sayılmaz', () => {
  const invs = [
    inv('TRY', [{ receipt_id: 'r1', amount: 100 }, { receipt_id: 'x', amount: 50 }, { receipt_id: null, amount: 70 }]),
    inv('EUR', [{ receipt_id: 'r1', amount: 9 }]),
  ];
  assert.equal(receiptCreditForCurrency(rcpt, invs, 'TRY'), 100);
});

test('çapraz: TL ödeme EUR faturasına dağıtıldıysa EUR ekstresinde EUR tutarıyla', () => {
  const invs = [inv('EUR', [{ receipt_id: 'r1', amount: 17.92 }])];
  assert.equal(receiptCreditForCurrency(rcpt, invs, 'EUR'), 17.92);
});

test('iptal faturaya ait ödeme sayılmaz (fatura ekstreden düşer)', () => {
  const invs = [inv('TRY', [{ receipt_id: 'r1', amount: 500 }], 'iptal')];
  assert.equal(receiptCreditForCurrency(rcpt, invs, 'TRY'), 0);
});

import { mergeReceiptPayments } from './receiptStatement.ts';

test('mergeReceiptPayments: aynı fişin aynı paradaki ödemeleri tek satır; fişsiz ödeme ayrı kalır', () => {
  const rows = [
    { id: 'a', receipt_id: 'r1', currency: 'TRY', amount: 6380, payment_date: '2026-10-31', payment_method: 'havale' },
    { id: 'b', receipt_id: 'r1', currency: 'TRY', amount: 8250, payment_date: '2026-10-31', payment_method: 'havale' },
    { id: 'c', receipt_id: 'r1', currency: 'TRY', amount: 1815, payment_date: '2026-10-31', payment_method: 'havale' },
    { id: 'd', receipt_id: null, currency: 'TRY', amount: 70, payment_date: '2026-10-20', payment_method: 'nakit' },
    { id: 'e', receipt_id: 'r1', currency: 'EUR', amount: 9, payment_date: '2026-10-31', payment_method: 'havale' },
  ];
  const out = mergeReceiptPayments(rows);
  assert.equal(out.length, 3);
  const tr = out.find((r) => r.receipt_id === 'r1' && r.currency === 'TRY')!;
  assert.equal(tr.amount, 16445);
  assert.equal(tr.merged, 3);
  assert.equal(out.find((r) => r.id === 'd')!.merged, 1);
  assert.equal(out.find((r) => r.receipt_id === 'r1' && r.currency === 'EUR')!.amount, 9);
});

import { receiptVoucherNo } from './receiptStatement.ts';

test('receiptVoucherNo: makbuz fişindeki numara (kimliğin ilk parçası, büyük harf)', () => {
  assert.equal(receiptVoucherNo('23fee05b-672b-46eb-9d74-cf4d9d6c4fc3'), '23FEE05B');
});

import { receiptDepositLabel } from './receiptStatement.ts';

test('receiptDepositLabel: seçilen hesap adı; nakitte hesap yoksa Nakit Kasa; diğerinde boş', () => {
  assert.equal(receiptDepositLabel({ payment_method: 'havale', account_label: 'Ziraat Bankası' }), 'Ziraat Bankası');
  assert.equal(receiptDepositLabel({ payment_method: 'nakit', account_label: null }), 'Nakit Kasa');
  assert.equal(receiptDepositLabel({ payment_method: 'havale', account_label: null }), null);
  assert.equal(receiptDepositLabel({ payment_method: 'nakit', account_label: null }, (s) => `[${s}]`), '[Nakit Kasa]');
});

import { receiptCoverage, formatReceiptCoverage } from './receiptStatement.ts';

const cinv = (no: string, date: string, amt: number, status = 'odendi', currency = 'TRY') =>
  ({ id: no, invoice_number: no, issue_date: date, currency, status, payments: [{ receipt_id: 'c1', amount: amt }] });
const crcpt = { id: 'c1', base_currency: 'TRY', total_base: 8800, allocated_base: 7500 };

test('receiptCoverage: fatura başına döküm (tarih artan) ve alacak', () => {
  const invs = [cinv('F-1240', '2026-10-05', 5900), cinv('F-1212', '2026-09-10', 1600)];
  const c = receiptCoverage(crcpt, invs, 'TRY');
  assert.deepEqual(c.items, [
    { invoiceNo: 'F-1212', issueDate: '2026-09-10', amount: 1600 },
    { invoiceNo: 'F-1240', issueDate: '2026-10-05', amount: 5900 },
  ]);
  assert.equal(c.credit, 1300);
  const e = receiptCoverage(crcpt, invs, 'EUR');
  assert.deepEqual(e.items, []);
  assert.equal(e.credit, 0);
});

test('receiptCoverage: iptal faturadaki ödeme items’a girmez', () => {
  const c = receiptCoverage(crcpt, [cinv('F-1', '2026-09-01', 100, 'iptal')], 'TRY');
  assert.deepEqual(c.items, []);
});

test('formatReceiptCoverage: tam biçim, yalnız alacak, boş', () => {
  const opts = {
    tr: (s: string) => s,
    money: (n: number) => n.toLocaleString('tr-TR'),
    month: (d: string) => ({ '09': 'Eylül', '10': 'Ekim' } as Record<string, string>)[d.slice(5, 7)],
  };
  const c = receiptCoverage(crcpt, [cinv('F-1212', '2026-09-10', 1600), cinv('F-1240', '2026-10-05', 5900)], 'TRY');
  assert.equal(formatReceiptCoverage(c, opts), 'Kapattığı: F-1212 Eylül 1.600 · F-1240 Ekim 5.900 · Alacağa 1.300');
  assert.equal(formatReceiptCoverage({ items: [], credit: 1300 }, opts), 'Alacağa 1.300');
  assert.equal(formatReceiptCoverage({ items: [], credit: 0 }, opts), null);
  assert.equal(
    formatReceiptCoverage({ items: [{ invoiceNo: 'F-9', issueDate: null, amount: 50 }], credit: 0 }, opts),
    'Kapattığı: F-9 50',
  );
});
