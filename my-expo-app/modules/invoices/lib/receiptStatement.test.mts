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
