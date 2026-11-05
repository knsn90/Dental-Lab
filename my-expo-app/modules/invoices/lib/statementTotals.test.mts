// node --test my-expo-app/modules/invoices/lib/statementTotals.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementPeriodTotals, lineDelta } from './statementTotals.ts';

const L = [
  { date: '2026-08-10', debit: 100, credit: 0 },
  { date: '2026-09-05', debit: 50,  credit: 0 },
  { date: '2026-09-20', debit: 0,   credit: 30 },
  { date: '2026-10-02', debit: 40,  credit: 0 },
];

test('filtre yok: açılış 0, kapanış tümü', () =>
  assert.deepEqual(statementPeriodTotals(L), { opening: 0, closing: 160 }));

test('başlangıç tarihi: öncesi devreder', () =>
  assert.deepEqual(statementPeriodTotals(L, '2026-09-01'), { opening: 100, closing: 160 }));

test('dönem: Eylül', () =>
  assert.deepEqual(statementPeriodTotals(L, '2026-09-01', '2026-09-30'), { opening: 100, closing: 120 }));

test('sınır günleri dahil', () =>
  assert.deepEqual(statementPeriodTotals(L, '2026-09-05', '2026-09-20'), { opening: 100, closing: 120 }));

test('boş liste', () =>
  assert.deepEqual(statementPeriodTotals([], '2026-09-01'), { opening: 0, closing: 0 }));

test('kuruş kayması yuvarlanır', () =>
  assert.deepEqual(statementPeriodTotals([{ date: '2026-01-01', debit: 0.1, credit: 0 }, { date: '2026-01-02', debit: 0.2, credit: 0 }]), { opening: 0, closing: 0.3 }));

test('indirim satırı bakiyeyi düşürür, fatura bilgisi düşürmez', () => {
  const lines = [
    { type: 'invoice', date: '2026-10-05', debit: 100, credit: 0, discount: 10 },
    { type: 'discount', date: '2026-10-31', debit: 0, credit: 0, discount: 9 },
  ];
  assert.deepEqual(statementPeriodTotals(lines, '2026-10-01', '2026-10-31'), { opening: 0, closing: 91 });
  assert.deepEqual(statementPeriodTotals(lines, '2026-11-01', '2026-11-30'), { opening: 91, closing: 91 });
  assert.equal(lineDelta(lines[0]), 100);
  assert.equal(lineDelta(lines[1]), -9);
});
