// node --test modules/clinicSummary/summary.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClinicSummaries, pickMain, rankTop,
  type ClinicSummary, type RevenueRow, type BalanceRow, type ReviewRow,
} from './summary.ts';
import { countOrders, type RawOrder } from '../admin/workStats/aggregate.ts';

const unitByServiceName = new Map<string, string | null>([
  ['zirkon', 'Üye'], ['gece plağı', 'Çene'],
]);
const clinicByDoctor = new Map<string, string>([['d1', 'cA'], ['d2', 'cB'], ['dX', 'cZ']]);
const clinicName = new Map<string, string>([['cA', 'Klinik A'], ['cB', 'Klinik B'], ['cN', 'Yeni Klinik']]);

let seq = 0;
function o(p: Partial<RawOrder> & { created_at: string }): RawOrder {
  seq += 1;
  return {
    id: `o${seq}`, order_number: `N${seq}`, work_type: 'Zirkon', status: 'uretimde',
    tooth_numbers: [11, 12], doctor_id: 'd1', ...p,
  };
}

function build(over: Partial<Parameters<typeof buildClinicSummaries>[0]> = {}) {
  return buildClinicSummaries({
    orders: [], clinicByDoctor, clinicName, unitByServiceName,
    revenueAll: [], revenueMonth: [], balances: [], reviews: [],
    currentMonth: '2026-11', today: '2026-11-12', ...over,
  });
}

test('summaries: üye countOrders ile birebir', () => {
  const orders = [
    o({ created_at: '2026-11-03T10:00:00', tooth_numbers: [11, 12, 13] }),
    o({ created_at: '2026-11-04T10:00:00', status: 'iptal' }),
    o({ created_at: '2026-11-05T10:00:00', tooth_numbers: [] }),
  ];
  const s = build({ orders }).get('cA')!;
  assert.equal(s.all.qty.uye, 3);
  assert.equal(s.all.orders, 1);
  const parity = countOrders({ orders, clinicByDoctor, unitByServiceName, clinicName })
    .filter((c) => c.clinicId === 'cA' && c.bucket === 'uye').reduce((a, c) => a + c.qty, 0);
  assert.equal(s.all.qty.uye, parity);
});

test('summaries: bu ay yalnız currentMonth', () => {
  const orders = [
    o({ created_at: '2026-11-02T10:00:00' }),
    o({ created_at: '2026-10-20T10:00:00' }),
  ];
  const s = build({ orders }).get('cA')!;
  assert.equal(s.month.orders, 1);
  assert.equal(s.all.orders, 2);
  assert.equal(s.month.qty.uye, 2);
  assert.equal(s.lastOrderAt, '2026-11-02T10:00:00');
});

test('summaries: ciro net, döviz başına', () => {
  const revenueAll: RevenueRow[] = [
    { clinic_id: 'cA', currency: 'EUR', revenue: 100, revenue_base: 3500 },
    { clinic_id: 'cA', currency: 'EUR', revenue: -20, revenue_base: -700, row_kind: 'statement_discount' },
    { clinic_id: 'cA', currency: 'TRY', revenue: 500, revenue_base: 500 },
  ];
  const s = build({ revenueAll }).get('cA')!;
  assert.deepEqual(s.all.revenue, [{ currency: 'TRY', amount: 500 }, { currency: 'EUR', amount: 80 }]);
  assert.equal(s.all.revenueBase, 3300);
  assert.deepEqual(s.month.revenue, []);
});

test('summaries: siparişsiz klinik sıfır özet', () => {
  const s = build().get('cN')!;
  assert.equal(s.name, 'Yeni Klinik');
  assert.equal(s.all.orders, 0);
  assert.deepEqual(s.all.qty, { uye: 0, cene: 0, adet: 0 });
  assert.equal(s.lastOrderAt, null);
  assert.equal(s.rating, null);
  assert.deepEqual(s.balance, []);
  assert.equal(s.oldestOverdueDays, null);
});

test('summaries: borç ve gecikme', () => {
  const balances: BalanceRow[] = [
    { clinic_id: 'cA', currency: 'TRY', balance: 120, overdue_net: 30, aging_current: 90, aging_30: 30, aging_60: 0, aging_90: 0, oldest_overdue_date: '2026-10-31' },
    { clinic_id: 'cB', currency: 'TRY', balance: 50, overdue_net: 0, aging_current: 50, aging_30: 0, aging_60: 0, aging_90: 0, oldest_overdue_date: null },
  ];
  const m = build({ balances });
  const a = m.get('cA')!;
  assert.deepEqual(a.balance, [{ currency: 'TRY', amount: 120 }]);
  assert.deepEqual(a.overdue, [{ currency: 'TRY', amount: 30 }]);
  assert.equal(a.oldestOverdueDays, 12);
  assert.deepEqual(a.aging, { current: 90, d30: 30, d60: 0, d90: 0 });
  const b = m.get('cB')!;
  assert.deepEqual(b.overdue, []);
  assert.equal(b.oldestOverdueDays, null);
});

test('summaries: çok dövizde aging null', () => {
  const row = (currency: string): BalanceRow => ({ clinic_id: 'cA', currency, balance: 10, overdue_net: 0, aging_current: 10, aging_30: 0, aging_60: 0, aging_90: 0, oldest_overdue_date: null });
  assert.equal(build({ balances: [row('TRY'), row('EUR')] }).get('cA')!.aging, null);
});

test('summaries: puan ortalaması', () => {
  const reviews: ReviewRow[] = [
    { clinic_id: 'cA', overall: 5 }, { clinic_id: 'cA', overall: 4 }, { clinic_id: 'cA', overall: null },
  ];
  assert.deepEqual(build({ reviews }).get('cA')!.rating, { avg: 4.5, count: 2 });
});

test('summaries: UNKNOWN_CLINIC_ID haritada yok', () => {
  const m = build({ orders: [o({ created_at: '2026-11-02T10:00:00', doctor_id: 'dX' })] });
  assert.equal(m.has('__unknown__'), false);
  assert.equal(m.get('cA')!.all.orders, 0);
});

test('pickMain: en büyük döviz + kalan sayısı', () => {
  assert.deepEqual(pickMain([{ currency: 'TRY', amount: 500 }, { currency: 'EUR', amount: 80 }]),
    { main: { currency: 'TRY', amount: 500 }, rest: 1 });
  assert.deepEqual(pickMain([]), { main: null, rest: 0 });
});

function fake(id: string, name: string, uye: number, base: number, overdue = false): ClinicSummary {
  const fig = { orders: uye ? 1 : 0, qty: { uye, cene: 0, adet: 0 }, revenue: [], revenueBase: base };
  return {
    clinicId: id, name, all: fig, month: fig, lastOrderAt: null, balance: [],
    overdue: overdue ? [{ currency: 'TRY', amount: 1 }] : [], aging: null, oldestOverdueDays: null, rating: null,
  };
}

test('rankTop: üye sırası, eşitlikte ad', () => {
  const m = new Map([['b', fake('b', 'Beta', 5, 0)], ['a', fake('a', 'Alfa', 5, 0)], ['c', fake('c', 'Cem', 9, 0)]]);
  assert.deepEqual(rankTop(m, 'all', 'uye').map((r) => r.clinicId), ['c', 'a', 'b']);
});

test('rankTop: puan formülü', () => {
  const m = new Map([['A', fake('A', 'A', 10, 0)], ['B', fake('B', 'B', 5, 100)]]);
  const r = rankTop(m, 'all', 'score');
  assert.deepEqual(r.map((x) => [x.clinicId, x.score]), [['B', 75], ['A', 50]]);
});

test('rankTop: boş dönem boş liste', () => {
  const m = new Map([['A', fake('A', 'A', 0, 0)]]);
  assert.deepEqual(rankTop(m, 'month', 'uye'), []);
});

test('rankTop: overdue işareti sırayı değiştirmez, ilk 5', () => {
  const m = new Map<string, ClinicSummary>();
  for (let i = 1; i <= 7; i++) m.set(`c${i}`, fake(`c${i}`, `K${i}`, 10 - i, 0, i === 1));
  const r = rankTop(m, 'all', 'uye');
  assert.equal(r.length, 5);
  assert.equal(r[0].clinicId, 'c1');
  assert.equal(r[0].overdue, true);
  assert.equal(r[1].overdue, false);
});
