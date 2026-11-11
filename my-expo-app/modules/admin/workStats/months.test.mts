// node --test modules/admin/workStats/months.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKeyOf, monthKeyOfIso, shiftMonth, windowMonths, compareMonth, monthLabel, fetchFromIso,
} from './months.ts';

test('shiftMonth yıl sınırlarını aşar', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 1), '2026-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('windowMonths seçili ay dahil, eskiden yeniye', () => {
  const w = windowMonths('2026-03', 12);
  assert.equal(w.length, 12);
  assert.equal(w[0], '2025-04');
  assert.equal(w[11], '2026-03');
});

test('compareMonth', () => {
  assert.equal(compareMonth('2026-01', 'prev'), '2025-12');
  assert.equal(compareMonth('2026-11', 'lastYear'), '2025-11');
});

test('monthKeyOfIso / monthKeyOf', () => {
  assert.equal(monthKeyOfIso('not-a-date'), null);
  assert.equal(monthKeyOfIso(null), null);
  assert.equal(monthKeyOfIso(undefined), null);
  assert.equal(monthKeyOf(new Date(2026, 2, 5)), '2026-03');
  assert.equal(monthKeyOfIso(new Date(2026, 10, 15, 12).toISOString()), '2026-11');
});

test('monthLabel', () => {
  const long = monthLabel('2026-11', 'tr-TR', 'long');
  assert.match(long, /Kasım/);
  assert.match(long, /2026/);
  assert.match(monthLabel('2026-11', 'tr-TR', 'short'), /Kas/);
});

test('fetchFromIso 23 ay geriden ayın 1i', () => {
  const d = new Date(fetchFromIso('2026-11'));
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
});
