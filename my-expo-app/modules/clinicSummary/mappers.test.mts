// node --test modules/clinicSummary/mappers.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRevenueRows, mapReviewRows, mapBalanceRows } from './mappers.ts';

test('mapRevenueRows: string sayılar Number, clinic_id null atılır', () => {
  const r = mapRevenueRows([
    { clinic_id: 'cA', currency: 'EUR', revenue: '12.50', revenue_base: '440', row_kind: 'order' },
    { clinic_id: null, currency: 'TRY', revenue: '5', revenue_base: '5' },
    { clinic_id: 'cB', currency: null, revenue: null, revenue_base: undefined },
  ]);
  assert.deepEqual(r, [
    { clinic_id: 'cA', currency: 'EUR', revenue: 12.5, revenue_base: 440, row_kind: 'order' },
    { clinic_id: 'cB', currency: 'TRY', revenue: 0, revenue_base: 0, row_kind: null },
  ]);
});

test('mapReviewRows: sipariş→hekim→klinik zinciri, eşleşmeyen atlanır', () => {
  const orderDoctor = new Map([['o1', 'd1'], ['o2', 'd9']]);
  const clinicByDoctor = new Map([['d1', 'cA']]);
  const r = mapReviewRows(
    [{ overall: 5, work_order_id: 'o1' }, { overall: 3, work_order_id: 'o2' }, { overall: 4, work_order_id: 'o3' }],
    orderDoctor, clinicByDoctor,
  );
  assert.deepEqual(r, [{ clinic_id: 'cA', overall: 5 }]);
});

test('mapBalanceRows: lab süzgeci + sayı', () => {
  const r = mapBalanceRows([
    { clinic_id: 'cA', lab_id: 'L', currency: 'TRY', balance: '10', overdue_net: '2', aging_current: null, aging_30: '1', aging_60: 0, aging_90: 0, oldest_overdue_date: '2026-10-01' },
    { clinic_id: 'cB', lab_id: 'X', currency: 'TRY', balance: 1 },
  ], 'L');
  assert.deepEqual(r, [{ clinic_id: 'cA', currency: 'TRY', balance: 10, overdue_net: 2, aging_current: 0, aging_30: 1, aging_60: 0, aging_90: 0, oldest_overdue_date: '2026-10-01' }]);
});
