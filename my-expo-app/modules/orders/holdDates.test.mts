// node --test my-expo-app/modules/orders/holdDates.test.mts   (.mts → tsc kapsamı dışında)
// Bekleme gün modeli (saf) — geriye dönük başlangıç/bitiş, uzatma, uzun bekleme (madde 13, spec §4.1-4.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LONG_HOLD_DAYS, daysBetween, holdExtensionDays, shiftedDelivery, holdStartFloor,
  validateHoldStart, validateResumeStart, validateHoldEnd, isLongHold, heldAgeDays,
} from './holdDates.ts';

test('takvim günü farkı, ay geçişinde de doğru', () => {
  assert.equal(daysBetween('2026-10-18', '2026-10-25'), 7);
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
});

test('uzatma = bitiş günü − başlangıç günü; aynı gün 0, ters sıra 0', () => {
  assert.equal(holdExtensionDays('2026-10-18', '2026-10-25'), 7);
  assert.equal(holdExtensionDays('2026-10-18', '2026-10-18'), 0);
  assert.equal(holdExtensionDays('2026-10-25', '2026-10-18'), 0);
});

test('hekim/klinik kaynaklıda teslim kayar, lab kaynaklıda kaymaz (spec §4.2 örneği)', () => {
  assert.equal(shiftedDelivery('2026-10-20', 7, 'client'), '2026-10-27');
  assert.equal(shiftedDelivery('2026-10-20', 7, 'lab'), '2026-10-20');
});

test('başlangıç tabanı: siparişin açıldığı gün ile önceki beklemenin bitişinin büyüğü', () => {
  assert.equal(holdStartFloor({ createdDay: '2026-10-10', prevEndDay: '2026-10-15' }), '2026-10-15');
  assert.equal(holdStartFloor({ createdDay: '2026-10-10', prevEndDay: null }), '2026-10-10');
});

test('bekletme başlangıcı: gelecek ve taban öncesi reddedilir', () => {
  const o = { floor: '2026-10-10', today: '2026-11-02' };
  assert.deepEqual(validateHoldStart('2026-11-03', o), { code: 'future' });
  assert.deepEqual(validateHoldStart('2026-10-09', o), { code: 'before_floor', boundary: '2026-10-10' });
  assert.equal(validateHoldStart('2026-10-10', o), null);
  assert.equal(validateHoldStart('2026-11-02', o), null);
});

test('devam ettirirken başlangıç yalnız geri çekilir, taban altına inemez', () => {
  const o = { currentStart: '2026-10-18', floor: '2026-10-01', today: '2026-11-02' };
  assert.deepEqual(validateResumeStart('2026-10-20', o), { code: 'later_than_current', boundary: '2026-10-18' });
  assert.deepEqual(validateResumeStart('2026-09-30', o), { code: 'before_floor', boundary: '2026-10-01' });
  assert.equal(validateResumeStart('2026-10-18', o), null);
  assert.equal(validateResumeStart('2026-10-05', o), null);
});

test('bitiş: başlangıçtan önce ve gelecekte olamaz', () => {
  const o = { startDay: '2026-10-18', today: '2026-11-02' };
  assert.deepEqual(validateHoldEnd('2026-10-17', o), { code: 'before_start', boundary: '2026-10-18' });
  assert.deepEqual(validateHoldEnd('2026-11-03', o), { code: 'future' });
  assert.equal(validateHoldEnd('2026-10-18', o), null);
});

test('uzun bekleme 3 günü aşan', () => {
  assert.equal(LONG_HOLD_DAYS, 3);
  assert.equal(isLongHold(3), false);
  assert.equal(isLongHold(4), true);
});

test('listede bekleme süresi: yalnız prova dışı beklemede, başlangıç gününden bugüne', () => {
  const today = '2026-11-02';
  assert.equal(heldAgeDays({ hold_status: 'on_hold', hold_category: 'material', startDay: '2026-10-28' }, today), 5);
  assert.equal(heldAgeDays({ hold_status: 'on_hold', hold_category: null, startDay: '2026-11-02' }, today), 0);
  // prova beklemesi "Provada" gösterir, süre değil
  assert.equal(heldAgeDays({ hold_status: 'on_hold', hold_category: 'client_prova', startDay: '2026-10-28' }, today), null);
  assert.equal(heldAgeDays({ hold_status: null, hold_category: null, startDay: '2026-10-28' }, today), null);
  assert.equal(heldAgeDays({ hold_status: 'on_hold', hold_category: 'material', startDay: null }, today), null);
  // saat farkıyla yarına düşmüş başlangıç negatif gün göstermez
  assert.equal(heldAgeDays({ hold_status: 'on_hold', hold_category: 'material', startDay: '2026-11-03' }, today), 0);
});
