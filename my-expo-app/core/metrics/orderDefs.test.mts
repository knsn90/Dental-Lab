// node --test my-expo-app/core/metrics/orderDefs.test.mts   (.mts → tsc kapsamı dışında)
// Sipariş tanımlarının istemci aynası; SQL karşılığı: lab_today, wo_is_open, wo_is_overdue (20261026100000).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labTodayOf, addDays, isOpenOrder, isOverdueOrder, isUrgentOpen, isDueOn } from './orderDefs.ts';

test('lab günü saat dilimine göre: TR gece 01:30 ertesi gündür', () => {
  assert.equal(labTodayOf('Europe/Istanbul', new Date('2026-10-26T22:30:00Z')), '2026-10-27');
  assert.equal(labTodayOf('Europe/Istanbul', new Date('2026-10-26T20:00:00Z')), '2026-10-26');
  assert.equal(labTodayOf(null, new Date('2026-10-26T10:00:00Z')), '2026-10-26');
  assert.equal(labTodayOf('Asia/Tehran', new Date('2026-10-26T21:00:00Z')), '2026-10-27');
});

test('addDays ay ve yıl sınırını aşar', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('geciken: teslim tarihi bugünden önce, açık, beklemede değil', () => {
  const today = '2026-10-26';
  assert.equal(isOverdueOrder({ status: 'uretimde', delivery_date: '2026-10-25' }, today), true);
  assert.equal(isOverdueOrder({ status: 'uretimde', delivery_date: '2026-10-26' }, today), false);
  assert.equal(isOverdueOrder({ status: 'teslim_edildi', delivery_date: '2026-10-20' }, today), false);
  assert.equal(isOverdueOrder({ status: 'iptal', delivery_date: '2026-10-20' }, today), false);
  assert.equal(isOverdueOrder({ status: 'uretimde', delivery_date: '2026-10-20', is_archived: true }, today), false);
  assert.equal(isOverdueOrder({ status: 'uretimde', delivery_date: '2026-10-20', hold_status: 'on_hold' }, today), false);
  assert.equal(isOverdueOrder({ status: 'uretimde', delivery_date: null }, today), false);
});

test('kuryedeki iş teslim edilmiş sayılmaz, gecikebilir', () => {
  const today = '2026-10-26';
  assert.equal(isOverdueOrder({ status: 'kuryede', delivery_date: '2026-10-25' }, today), true);
  assert.equal(isOverdueOrder({ status: 'teslimata_hazir', delivery_date: '2026-10-25' }, today), true);
  assert.equal(isOverdueOrder({ status: 'kurye_bekleniyor', delivery_date: '2026-10-25' }, today), true);
});

test('acil yalnız açık işte: teslim edilmiş acil iş acil değildir', () => {
  assert.equal(isUrgentOpen({ status: 'teslim_edildi', is_urgent: true }), false);
  assert.equal(isUrgentOpen({ status: 'alindi', is_urgent: true }), true);
  assert.equal(isUrgentOpen({ status: 'alindi', is_urgent: true, is_archived: true }), false);
  assert.equal(isUrgentOpen({ status: 'alindi', is_urgent: false }), false);
});

test('açık iş ve belirli günde teslim', () => {
  assert.equal(isOpenOrder({ status: 'alindi' }), true);
  assert.equal(isOpenOrder({ status: 'iptal' }), false);
  assert.equal(isDueOn({ status: 'iptal', delivery_date: '2026-10-26' }, '2026-10-26'), false);
  assert.equal(isDueOn({ status: 'uretimde', delivery_date: '2026-10-26' }, '2026-10-26'), true);
  assert.equal(isDueOn({ status: 'uretimde', delivery_date: '2026-10-26', hold_status: 'on_hold' }, '2026-10-26'), true);
});
