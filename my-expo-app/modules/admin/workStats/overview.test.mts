// node --test modules/admin/workStats/overview.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankWorkTypes, splitChips, diffOf, signedText, kpiDiffText, barPct, scrollOffsetFor, CHIP_LIMIT,
} from './overview.ts';

const c = (month: string, workType: string, qty: number, clinicId = 'c1') =>
  ({ id: `${month}${workType}${qty}`, orderNumber: '', month, workType, unit: null, bucket: 'uye', qty, clinicId }) as any;

test('rankWorkTypes: pencere içi toplam, çoktan aza, eşitlikte ad', () => {
  const list = [
    c('2026-10', 'Zirkon', 5), c('2026-11', 'Zirkon', 3),
    c('2026-11', 'E.max', 8),
    c('2026-11', 'Akrilik', 8),
    c('2025-01', 'Eski', 100), // pencere dışı
  ];
  assert.deepEqual(rankWorkTypes(list, ['2026-10', '2026-11'], null), ['Akrilik', 'E.max', 'Zirkon']);
});

test('rankWorkTypes: klinik süzgeci', () => {
  const list = [c('2026-11', 'Zirkon', 5, 'c1'), c('2026-11', 'E.max', 9, 'c2')];
  assert.deepEqual(rankWorkTypes(list, ['2026-11'], 'c1'), ['Zirkon']);
});

test('splitChips: ilk 6 görünür, kalanı Diğer', () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const s = splitChips(all);
  assert.equal(CHIP_LIMIT, 6);
  assert.deepEqual(s.visible, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(s.overflow, ['g', 'h']);
  assert.deepEqual(splitChips(['a']).overflow, []);
});

test('diffOf: kıyas yoksa null, yön doğru', () => {
  assert.equal(diffOf(5, null), null);
  assert.equal(diffOf(5, undefined), null);
  assert.deepEqual(diffOf(63, 84), { delta: -21, dir: 'down' });
  assert.deepEqual(diffOf(10, 4), { delta: 6, dir: 'up' });
  assert.deepEqual(diffOf(4, 4), { delta: 0, dir: 'flat' });
  // sıfıra kıyas: yüzde yok, yalnız mutlak fark
  assert.deepEqual(diffOf(7, 0), { delta: 7, dir: 'up' });
});

test('signedText: eksi işareti U+2212', () => {
  assert.equal(signedText(-21), '−21');
  assert.equal(signedText(3), '+3');
  assert.equal(signedText(0), '0');
});

test('kpiDiffText: brief biçimi', () => {
  assert.equal(kpiDiffText(63, 84, 'Eki', 'x'), '−21 · Eki 84');
  assert.equal(kpiDiffText(4, 2, 'Eki', 'x'), '+2 · Eki 2');
  assert.equal(kpiDiffText(4, null, 'Kas', 'geçen yılın bu ayına ait kayıt yok'), '— · geçen yılın bu ayına ait kayıt yok');
});

test('barPct: 0 → 0, küçük değer en az min, üst sınır 100', () => {
  assert.equal(barPct(0, 10), 0);
  assert.equal(barPct(null, 10), 0);
  assert.equal(barPct(5, 0), 0);
  assert.equal(barPct(1, 1000), 4);
  assert.equal(barPct(5, 10), 50);
  assert.equal(barPct(20, 10), 100);
});

test('scrollOffsetFor: ortalar ve sınırlar', () => {
  // 12 sütun × 50 = 600, görünür 300
  assert.equal(scrollOffsetFor(11, 50, 300, 600), 300); // sona dayanır
  assert.equal(scrollOffsetFor(0, 50, 300, 600), 0);
  assert.equal(scrollOffsetFor(6, 50, 300, 600), 175);
  assert.equal(scrollOffsetFor(3, 50, 600, 600), 0); // sığıyorsa kaydırma yok
});
