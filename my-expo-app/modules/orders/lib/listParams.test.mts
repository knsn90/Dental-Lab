// node --test my-expo-app/modules/orders/lib/listParams.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrdersListParams, matchesDueFlag, isPastDue, localISODate, listStateFromParams, paramsKey, holdActionsAllowed } from './listParams.ts';
import * as defs from '../../../core/metrics/orderDefs.ts';

const S = ['all', 'alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];

test('geçerli parametreler', () => {
  assert.deepEqual(parseOrdersListParams({ status: 'alindi' }, S), { status: 'alindi', flag: null });
  assert.deepEqual(parseOrdersListParams({ filter: 'overdue' }, S), { status: null, flag: 'overdue' });
  assert.deepEqual(parseOrdersListParams({ filter: ['today'] }, S), { status: null, flag: 'today' });
  assert.deepEqual(parseOrdersListParams({ filter: 'urgent', status: 'uretimde' }, S), { status: 'uretimde', flag: 'urgent' });
});

test('bilinmeyen parametre yok sayılır', () => {
  assert.deepEqual(parseOrdersListParams({ status: 'foo', filter: 'xyz' }, S), { status: null, flag: null });
  assert.deepEqual(parseOrdersListParams({}, S), { status: null, flag: null });
});

const o = (d: string, s = 'uretimde', u = false, extra: Record<string, unknown> = {}) => ({ delivery_date: d, status: s, is_urgent: u, ...extra });
const T = '2026-10-24', M = '2026-10-25';
// Tek tanım (2026-10-26): süzgeç core/metrics/orderDefs.ts aynasını kullanır (parametre olarak verilir).
const due = (x: ReturnType<typeof o>, f: Parameters<typeof matchesDueFlag>[1]) => matchesDueFlag(x, f, T, M, defs);

test('bugün/yarın/geciken/acil', () => {
  assert.equal(due(o('2026-10-24'), 'today'), true);
  assert.equal(due(o('2026-10-24', 'teslim_edildi'), 'today'), false);
  assert.equal(due(o('2026-10-25'), 'today'), false);
  assert.equal(due(o('2026-10-25'), 'tomorrow'), true);
  assert.equal(due(o('2026-10-20'), 'overdue'), true);
  assert.equal(due(o('2026-10-20', 'teslim_edildi'), 'overdue'), false);
  assert.equal(due(o('2026-10-30', 'uretimde', true), 'urgent'), true);
  assert.equal(due(o('2026-10-30'), 'urgent'), false);
});

test('tek tanım: teslim edilmiş acil iş acil değil; iptal bugün çıkmaz; beklemedeki/arşivdeki gecikmez', () => {
  assert.equal(due(o('2026-10-30', 'teslim_edildi', true), 'urgent'), false);
  assert.equal(due(o('2026-10-24', 'iptal'), 'today'), false);
  assert.equal(due(o('2026-10-20', 'uretimde', false, { hold_status: 'on_hold' }), 'overdue'), false);
  assert.equal(due(o('2026-10-20', 'uretimde', false, { is_archived: true }), 'overdue'), false);
  assert.equal(due(o('2026-10-20', 'kuryede'), 'overdue'), true);
});

test('filtre yoksa hepsi geçer', () =>
  assert.equal(due(o('2026-10-20'), null), true));

test('isPastDue: tarih dizesiyle yerel güne göre (UTC gece yarısı tuzağı yok)', () => {
  assert.equal(isPastDue('2026-10-24', '2026-10-24'), false);          // bugün teslim → gecikmiş DEĞİL
  assert.equal(isPastDue('2026-10-23', '2026-10-24'), true);
  assert.equal(isPastDue('2026-10-25', '2026-10-24'), false);
  assert.equal(isPastDue('2026-10-24T00:00:00+00:00', '2026-10-24'), false);
  assert.equal(isPastDue(null, '2026-10-24'), false);
  assert.equal(isPastDue('', '2026-10-24'), false);
});

test('localISODate: yerel takvim günü', () => {
  assert.equal(localISODate(new Date(2026, 9, 24, 2, 30)), '2026-10-24');   // 02:30 yerel
  assert.equal(localISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('listStateFromParams: parametre listenin TAM filtre durumunu verir (çipler birbirini dışlar)', () => {
  assert.deepEqual(listStateFromParams({ filter: 'overdue' }, S), { status: 'all', overdue: true, urgent: false, dueFlag: null, doctorId: null, provaChip: null, hold: false });
  assert.deepEqual(listStateFromParams({ filter: 'today', status: 'uretimde' }, S), { status: 'uretimde', overdue: false, urgent: false, dueFlag: 'today', doctorId: null, provaChip: null, hold: false });
  assert.deepEqual(listStateFromParams({ filter: 'urgent' }, S), { status: 'all', overdue: false, urgent: true, dueFlag: null, doctorId: null, provaChip: null, hold: false });
  assert.deepEqual(listStateFromParams({}, S), { status: 'all', overdue: false, urgent: false, dueFlag: null, doctorId: null, provaChip: null, hold: false });
  assert.deepEqual(listStateFromParams({ filter: 'xyz', status: 'foo' }, S), { status: 'all', overdue: false, urgent: false, dueFlag: null, doctorId: null, provaChip: null, hold: false });
});

test('paramsKey: yalnız filter+status+doctor değişince değişir', () => {
  assert.equal(paramsKey({}), '||');
  assert.equal(paramsKey({ filter: 'overdue' }), 'overdue||');
  assert.equal(paramsKey({ filter: ['today'], status: 'alindi', id: 'x' }), 'today|alindi|');
  assert.equal(paramsKey({ doctor: 'd1' }), '||d1');
  assert.notEqual(paramsKey({ doctor: 'd1' }), paramsKey({ doctor: 'd2' }));
});

test('?doctor=<id>: genel aramadan hekimin siparişleri (2. dalga 1)', () => {
  assert.equal(listStateFromParams({ doctor: 'd1' }, S).doctorId, 'd1');
  assert.equal(listStateFromParams({ doctor: ['d2'] }, S).doctorId, 'd2');
  assert.equal(listStateFromParams({ doctor: '  ' }, S).doctorId, null);
  assert.equal(listStateFromParams({ doctor: 'd1', filter: 'urgent' }, S).urgent, true);
});

// 2. dalga 4: bildirim ve özet bağlantıları listeyi prova / randevu riski süzgeciyle açar
test('?filter=prova|risk prova çipini açar; diğer süzgeçleri kapalı bırakır', () => {
  const p = listStateFromParams({ filter: 'prova' }, ['alindi']);
  assert.equal(p.provaChip, 'prova');
  assert.equal(p.overdue, false);
  assert.equal(p.urgent, false);
  assert.equal(listStateFromParams({ filter: 'risk' }, ['alindi']).provaChip, 'risk');
  assert.equal(listStateFromParams({ filter: 'overdue' }, ['alindi']).provaChip, null);
  assert.equal(listStateFromParams({}, ['alindi']).provaChip, null);
});

// Madde 13: ?filter=hold → "Beklemede" çipi; prova çipiyle birbirini dışlar
test('?filter=hold beklemede çipini açar; prova çipi kapalı kalır', () => {
  const h = listStateFromParams({ filter: 'hold' }, ['alindi']);
  assert.equal(h.hold, true);
  assert.equal(h.provaChip, null);
  assert.equal(h.overdue, false);
  assert.equal(listStateFromParams({ filter: 'prova' }, ['alindi']).hold, false);
  assert.equal(listStateFromParams({}, ['alindi']).hold, false);
});

test('holdActionsAllowed: bekletme eylemleri yalnız lab ve yönetici panelinde', () => {
  assert.equal(holdActionsAllowed('(lab)'), true);
  assert.equal(holdActionsAllowed('(admin)'), true);
  for (const g of ['(clinic)', '(doctor)', '(station)', '']) assert.equal(holdActionsAllowed(g), false, g);
});
