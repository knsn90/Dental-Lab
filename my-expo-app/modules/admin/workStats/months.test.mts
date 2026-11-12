// node --test modules/admin/workStats/months.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKeyOf, monthKeyOfIso, shiftMonth, windowMonths, compareMonth, monthLabel, fetchFromIso,
  isLiveWindow,
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

test('monthLabel her zaman miladi takvim (Farsça Celali yerel ayarında bile)', () => {
  const fa = monthLabel('2026-11', 'fa-IR-u-ca-persian', 'long');
  assert.ok(!fa.includes('آبان'), fa);
  assert.ok(fa.includes('نوامبر'), fa);
  const faShort = monthLabel('2026-11', 'fa-IR-u-ca-persian', 'short');
  assert.ok(faShort.includes('نوامبر'), faShort);
  assert.ok(monthLabel('2026-11', 'fa-IR-u-ca-persian-nu-latn', 'long').includes('نوامبر'));
  // uzantısız yerel ayar da miladi kalır, dil korunur
  assert.match(monthLabel('2026-11', 'tr-TR', 'long'), /Kasım/);
});

test("monthLabel 'shortYear': kısa ay + yıl, miladi", () => {
  const tr = monthLabel('2025-11', 'tr-TR', 'shortYear');
  assert.match(tr, /Kas/);
  assert.match(tr, /2025/);
  const fa = monthLabel('2025-11', 'fa-IR-u-ca-persian-nu-latn', 'shortYear');
  assert.ok(fa.includes('نوامبر'), fa);
  assert.ok(fa.includes('2025'), fa);
  // 'short' yılsız kalır (önceki ay kıyası değişmez)
  assert.doesNotMatch(monthLabel('2025-11', 'tr-TR', 'short'), /2025/);
});

test('isLiveWindow: içinde bulunulan ayı içeren pencere tazelenir, geçmiş pencere önbellekte kalır', () => {
  assert.equal(isLiveWindow('2026-11', '2026-11'), true);
  assert.equal(isLiveWindow('2026-12', '2026-11'), true);
  assert.equal(isLiveWindow('2026-10', '2026-11'), false);
  assert.equal(isLiveWindow('2025-11', '2026-11'), false);
});
