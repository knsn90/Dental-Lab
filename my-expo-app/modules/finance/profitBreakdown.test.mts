// node --test my-expo-app/modules/finance/profitBreakdown.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClinicRows, buildServiceRows, sliceSum, missingCosts, marginLabel, countClinicRows, countServiceRows,
  type ClinicLine, type ServiceLine,
} from './profitBreakdown.ts';

const cl = (p: Partial<ClinicLine>): ClinicLine => ({
  clinic_id: null, clinic_name: null, doctor_id: null, doctor_name: null,
  currency: 'TRY', revenue: 0, revenue_base: 0, order_ids: [], ...p,
});
const sl = (p: Partial<ServiceLine>): ServiceLine => ({
  row_kind: 'service', service_id: null, service_name: null, unit: null, currency: 'TRY',
  quantity: 0, revenue: 0, revenue_base: 0, listed_quantity: 0, listed_revenue_base: 0, list_value_base: 0, ...p,
});

const CLINIC_LINES: ClinicLine[] = [
  cl({ clinic_id: 'A', clinic_name: 'Klinik A', doctor_id: 'd1', doctor_name: 'H1', currency: 'TRY', revenue: 1000, revenue_base: 25, order_ids: ['o1'] }),
  cl({ clinic_id: 'A', clinic_name: 'Klinik A', doctor_id: 'd1', doctor_name: 'H1', currency: 'EUR', revenue: 10, revenue_base: 10, order_ids: ['o1'] }),
  cl({ clinic_id: 'A', clinic_name: 'Klinik A', doctor_id: 'd2', doctor_name: 'H2', currency: 'TRY', revenue: 2000, revenue_base: 50, order_ids: ['o2'] }),
  cl({ clinic_id: 'B', clinic_name: 'Klinik B', doctor_id: 'd3', doctor_name: 'H3', currency: 'TRY', revenue: 4000, revenue_base: 100, order_ids: ['o3', 'o4'] }),
];

test('clinic rows merge currencies and doctors', () => {
  const rows = buildClinicRows(CLINIC_LINES);
  assert.deepEqual(rows.map(r => r.key), ['B', 'A']);
  assert.equal(rows[0].share, 54.1);
  assert.equal(rows[1].share, 45.9);
  const a = rows[1];
  assert.equal(a.kind, 'clinic');
  assert.equal(a.name, 'Klinik A');
  assert.deepEqual(a.slices, [{ currency: 'EUR', total: 10 }, { currency: 'TRY', total: 3000 }]);
  assert.equal(a.revenueBase, 85);
  assert.equal(a.orderCount, 2);
  assert.equal(a.doctors[0].key, 'd2');
  assert.equal(a.doctors[0].shareInClinic, 58.8);
  assert.equal(a.doctors[1].key, 'd1');
  assert.equal(a.doctors[1].orderCount, 1);
});

test('missing clinic falls back to doctor, then none (last)', () => {
  const rows = buildClinicRows([
    cl({ revenue: 999, revenue_base: 999, order_ids: ['x'] }),
    cl({ doctor_id: 'd9', doctor_name: 'H9', revenue: 5, revenue_base: 5, order_ids: ['y'] }),
  ]);
  assert.equal(rows[0].key, 'doctor:d9');
  assert.equal(rows[0].kind, 'doctorOnly');
  assert.equal(rows[0].name, 'H9');
  assert.equal(rows[rows.length - 1].kind, 'none');
  assert.equal(rows[rows.length - 1].key, 'none');
});

test('numeric strings are tolerated', () => {
  const rows = buildClinicRows([cl({ clinic_id: 'A', revenue: '12.5', revenue_base: '1.25', order_ids: null })]);
  assert.deepEqual(rows[0].slices, [{ currency: 'TRY', total: 12.5 }]);
  assert.equal(rows[0].revenueBase, 1.25);
  assert.equal(rows[0].orderCount, 0);
});

test('service rows: averages, list and discount across currencies', () => {
  const rows = buildServiceRows([
    sl({ service_id: 's1', service_name: 'Zirkonya', unit: 'diş', currency: 'TRY', quantity: 4, revenue: 400, revenue_base: 10, listed_quantity: 4, listed_revenue_base: 10, list_value_base: 12.5 }),
    sl({ service_id: 's1', service_name: 'Zirkonya', unit: 'diş', currency: 'EUR', quantity: 1, revenue: 3, revenue_base: 3, listed_quantity: 1, listed_revenue_base: 3, list_value_base: 3 }),
  ]);
  assert.equal(rows.length, 1);
  const s = rows[0];
  assert.equal(s.key, 's1');
  assert.equal(s.unit, 'diş');
  assert.equal(s.quantity, 5);
  assert.equal(s.revenueBase, 13);
  assert.equal(s.avgUnitPrice, 2.6);
  assert.equal(s.listUnitPrice, 3.1);
  assert.equal(s.discountPct, 16.1);
  assert.deepEqual(s.slices, [{ currency: 'EUR', total: 3 }, { currency: 'TRY', total: 400 }]);
});

test('service order keeps other and no_items last', () => {
  const rows = buildServiceRows([
    sl({ row_kind: 'no_items', revenue: 5, revenue_base: 5 }),
    sl({ row_kind: 'other', quantity: 3, revenue: 50, revenue_base: 50 }),
    sl({ service_id: 's1', service_name: 'Zirkonya', quantity: 5, revenue: 13, revenue_base: 13 }),
  ]);
  assert.deepEqual(rows.map(r => r.kind), ['service', 'other', 'no_items']);
  assert.deepEqual(rows.map(r => r.share), [19.1, 73.5, 7.4]);
  assert.equal(rows[1].avgUnitPrice, null);
  assert.equal(rows[2].avgUnitPrice, null);
});

test('service without list price', () => {
  const [s] = buildServiceRows([sl({ service_id: 's2', quantity: 2, revenue: 8, revenue_base: 8 })]);
  assert.equal(s.listUnitPrice, null);
  assert.equal(s.discountPct, null);
  assert.equal(s.avgUnitPrice, 4);
});

test('slice sums reconcile with input', () => {
  const rows = buildClinicRows(CLINIC_LINES);
  assert.deepEqual(sliceSum(rows), [{ currency: 'EUR', total: 10 }, { currency: 'TRY', total: 7000 }]);
  for (const r of rows) assert.deepEqual(sliceSum(r.doctors), r.slices);
  const svc = buildServiceRows([
    sl({ service_id: 's1', currency: 'TRY', revenue: 300, revenue_base: 3 }),
    sl({ row_kind: 'other', currency: 'EUR', revenue: 7, revenue_base: 7 }),
    sl({ row_kind: 'no_items', currency: 'TRY', revenue: 200, revenue_base: 2 }),
  ]);
  assert.deepEqual(sliceSum(svc), [{ currency: 'EUR', total: 7 }, { currency: 'TRY', total: 500 }]);
});

test('zero-revenue line keeps order count', () => {
  const [a] = buildClinicRows([
    cl({ clinic_id: 'A', doctor_id: 'd1', revenue: 1000, revenue_base: 25, order_ids: ['o1'] }),
    cl({ clinic_id: 'A', doctor_id: 'd5', revenue: 0, revenue_base: 0, order_ids: ['o7'] }),
  ]);
  assert.equal(a.orderCount, 2);
  const d5 = a.doctors.find(d => d.key === 'd5');
  assert.ok(d5);
  assert.deepEqual(d5.slices, []);
  assert.equal(d5.orderCount, 1);
});

test('missingCosts', () => {
  assert.deepEqual(missingCosts({ total_revenue: '100', total_labor: '0', total_overhead: 5 }), { labor: true, overhead: false });
  assert.deepEqual(missingCosts({ total_revenue: 0, total_labor: 0, total_overhead: 0 }), { labor: false, overhead: false });
  assert.deepEqual(missingCosts(null), { labor: false, overhead: false });
});

test('marginLabel', () => {
  assert.equal(marginLabel(35, { labor: false }), 'Mükemmel');
  assert.equal(marginLabel(25, { labor: false }), 'İyi');
  assert.equal(marginLabel(12, { labor: false }), 'Düşük');
  assert.equal(marginLabel(-1, { labor: false }), 'Risk');
  assert.equal(marginLabel(35, { labor: true }), null);
  assert.equal(marginLabel(null, { labor: false }), null);
});

test('ekstre indirimi kliniğin altında ayrı satır, klinik toplamını düşürür', () => {
  const rows = buildClinicRows([
    { clinic_id: 'c1', clinic_name: 'K', doctor_id: null, doctor_name: null, currency: 'TRY', revenue: 100, revenue_base: 100, order_ids: ['o1'] },
    { clinic_id: 'c1', clinic_name: 'K', doctor_id: null, doctor_name: null, currency: 'TRY', revenue: -30, revenue_base: -30, order_ids: [], row_kind: 'statement_discount' },
  ]);
  assert.equal(rows[0].revenueBase, 70);
  assert.deepEqual(rows[0].doctors.map(d => [d.key, d.revenueBase]), [['none', 100], ['statement_discount', -30]]);
  assert.equal(rows[0].orderCount, 1);
});
test('hizmet kırılımında ekstre indirimi en sonda ve toplamı düşürür', () => {
  const rows = buildServiceRows([
    { row_kind: 'service', service_id: 's1', service_name: 'Zirkon', unit: null, currency: 'TRY', quantity: 1, revenue: 100, revenue_base: 100, listed_quantity: 0, listed_revenue_base: 0, list_value_base: 0 },
    { row_kind: 'statement_discount', service_id: null, service_name: null, unit: null, currency: 'TRY', quantity: 0, revenue: -30, revenue_base: -30, listed_quantity: 0, listed_revenue_base: 0, list_value_base: 0 },
  ]);
  assert.deepEqual(rows.map(r => r.kind), ['service', 'statement_discount']);
  assert.equal(rows.reduce((s, r) => s + r.revenueBase, 0), 70);
  assert.equal(rows[1].avgUnitPrice, null);
});

test('ekstre indirimi alt satırı sıfır cirolu hekimden de sonra gelir, adı yok, siparişi yok', () => {
  const [a] = buildClinicRows([
    cl({ clinic_id: 'A', doctor_id: 'd1', doctor_name: 'H1', revenue: 100, revenue_base: 100, order_ids: ['o1'] }),
    cl({ clinic_id: 'A', doctor_id: 'd5', doctor_name: 'H5', revenue: 0, revenue_base: 0, order_ids: ['o7'] }),
    cl({ clinic_id: 'A', currency: 'EUR', revenue: -2, revenue_base: -2, row_kind: 'statement_discount' }),
    cl({ clinic_id: 'A', currency: 'TRY', revenue: -10, revenue_base: -10, row_kind: 'statement_discount' }),
  ]);
  assert.deepEqual(a.doctors.map(d => d.key), ['d1', 'd5', 'statement_discount']);
  const sd = a.doctors[2];
  assert.equal(sd.kind, 'statement_discount');
  assert.equal(sd.name, null);
  assert.equal(sd.orderCount, 0);
  assert.deepEqual(sd.slices, [{ currency: 'EUR', total: -2 }, { currency: 'TRY', total: -10 }]);
  assert.equal(a.doctors[0].kind, 'doctor');
  assert.equal(a.revenueBase, 88);
  assert.equal(a.orderCount, 2);
});

test('yalnız ekstre indirimi olan klinik: eksi ciro, hekimsiz siparişle birleşmez', () => {
  const rows = buildClinicRows([
    cl({ clinic_id: 'A', revenue: 50, revenue_base: 50, order_ids: ['o1'] }),
    cl({ clinic_id: 'B', clinic_name: 'Klinik B', revenue: -20, revenue_base: -20, row_kind: 'statement_discount' }),
  ]);
  assert.deepEqual(rows.map(r => [r.key, r.revenueBase, r.orderCount]), [['A', 50, 1], ['B', -20, 0]]);
  assert.deepEqual(rows[1].doctors.map(d => d.key), ['statement_discount']);
  assert.deepEqual(sliceSum(rows), [{ currency: 'TRY', total: 30 }]);
});

test('ekstre indirimi eksi kalemsiz satırdan da sonra gelir', () => {
  const rows = buildServiceRows([
    sl({ row_kind: 'statement_discount', currency: 'TRY', revenue: -10, revenue_base: -10 }),
    sl({ row_kind: 'no_items', revenue: -50, revenue_base: -50 }),
    sl({ service_id: 's1', service_name: 'Zirkonya', quantity: 1, revenue: 100, revenue_base: 100 }),
  ]);
  assert.deepEqual(rows.map(r => r.kind), ['service', 'no_items', 'statement_discount']);
  const sd = rows[2];
  assert.equal(sd.key, 'statement_discount');
  assert.equal(sd.name, null);
  assert.equal(sd.listUnitPrice, null);
  assert.equal(sd.discountPct, null);
});

// Fix round 1 (Ruling T): paylar indirim DIŞI satırların brüt toplamına göre; indirim satırının payı yok; sayılar indirimi saymaz
test('hizmet payı indirimsiz brüt toplama göre, indirim satırının payı yok', () => {
  const rows = buildServiceRows([
    sl({ service_id: 's1', service_name: 'Zirkonya', quantity: 1, revenue: 75, revenue_base: 75 }),
    sl({ service_id: 's2', service_name: 'E.max', quantity: 1, revenue: 25, revenue_base: 25 }),
    sl({ row_kind: 'statement_discount', revenue: -20, revenue_base: -20 }),
  ]);
  assert.deepEqual(rows.map(r => [r.kind, r.share]), [['service', 75], ['service', 25], ['statement_discount', null]]);
  assert.equal(countServiceRows(rows), 2);
});

test('hekim payı (shareInClinic) indirimsiz brüt klinik toplamına göre, indirim alt satırının payı yok', () => {
  const [a] = buildClinicRows([
    cl({ clinic_id: 'A', doctor_id: 'd1', doctor_name: 'H1', revenue: 60, revenue_base: 60, order_ids: ['o1'] }),
    cl({ clinic_id: 'A', doctor_id: 'd2', doctor_name: 'H2', revenue: 40, revenue_base: 40, order_ids: ['o2'] }),
    cl({ clinic_id: 'A', revenue: -25, revenue_base: -25, row_kind: 'statement_discount' }),
  ]);
  assert.equal(a.revenueBase, 75);
  assert.deepEqual(a.doctors.map(d => [d.key, d.shareInClinic]), [['d1', 60], ['d2', 40], ['statement_discount', null]]);
});

test('klinik sayısı yalnız indirimi olan kliniği saymaz; indirimsiz veride sayılar satır sayısıdır', () => {
  const rows = buildClinicRows([
    cl({ clinic_id: 'A', revenue: 50, revenue_base: 50, order_ids: ['o1'] }),
    cl({ clinic_id: 'A', revenue: -5, revenue_base: -5, row_kind: 'statement_discount' }),
    cl({ clinic_id: 'B', clinic_name: 'Klinik B', revenue: -20, revenue_base: -20, row_kind: 'statement_discount' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(countClinicRows(rows), 1);
  assert.equal(countClinicRows(buildClinicRows(CLINIC_LINES)), buildClinicRows(CLINIC_LINES).length);
  const svc = buildServiceRows([sl({ service_id: 's1', revenue: 10, revenue_base: 10 }), sl({ row_kind: 'other', revenue: 5, revenue_base: 5 })]);
  assert.equal(countServiceRows(svc), svc.length);
});

// Fix round 2 (review Important 1): klinikler arası pay indirimsiz brüt ciroya göre; yalnız indirimi olan kliniğin payı yok
test('klinik payı indirimsiz brüt toplama göre: A=100, yalnız indirimli B=−20 → A %100, B pay yok', () => {
  const rows = buildClinicRows([
    cl({ clinic_id: 'A', clinic_name: 'Klinik A', doctor_id: 'd1', doctor_name: 'H1', revenue: 100, revenue_base: 100, order_ids: ['o1'] }),
    cl({ clinic_id: 'B', clinic_name: 'Klinik B', revenue: -20, revenue_base: -20, row_kind: 'statement_discount' }),
  ]);
  assert.deepEqual(rows.map(r => [r.key, r.revenueBase, r.share]), [['A', 100, 100], ['B', -20, null]]);
});
test('klinik payı paydası indirimsiz: indirimli A (120 − 20) ve B 80 → A %60, B %40', () => {
  const rows = buildClinicRows([
    cl({ clinic_id: 'A', clinic_name: 'Klinik A', revenue: 120, revenue_base: 120, order_ids: ['o1'] }),
    cl({ clinic_id: 'A', clinic_name: 'Klinik A', revenue: -20, revenue_base: -20, row_kind: 'statement_discount' }),
    cl({ clinic_id: 'B', clinic_name: 'Klinik B', revenue: 80, revenue_base: 80, order_ids: ['o2'] }),
  ]);
  assert.deepEqual(rows.map(r => [r.key, r.revenueBase, r.share]), [['A', 100, 60], ['B', 80, 40]]);
});
