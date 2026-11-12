// node --test modules/admin/workStats/heatmap.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatLevel, heatAlpha, heatStrong, heatInk, composite, contrastRatio, HEAT_ALPHA, HEAT_LEVELS } from './heatmap.ts';

test('heatLevel: null → null (kayıt yok)', () => {
  assert.equal(heatLevel(null, 10), null);
  assert.equal(heatLevel(undefined, 10), null);
});

test('heatLevel: 0 ve max 0 → zemin', () => {
  assert.equal(heatLevel(0, 10), 0);
  assert.equal(heatLevel(0, 0), 0);
  assert.equal(heatLevel(3, 0), 0);
});

test('heatLevel: satırın en büyüğü en üst basamak; küçük pozitif en az 1', () => {
  assert.equal(heatLevel(10, 10), HEAT_LEVELS);
  assert.equal(heatLevel(1, 100), 1);
  assert.equal(heatLevel(5, 10), 3);
  assert.equal(heatLevel(6, 10), 3);
  assert.equal(heatLevel(7, 10), 4);
});

test('heatLevel: her satır kendi ölçeğinde (az gelen tipin dalgası da görünür)', () => {
  // 2'lik satırda 2 en yoğun; 80'lik satırda 2 en soluk
  assert.equal(heatLevel(2, 2), HEAT_LEVELS);
  assert.equal(heatLevel(2, 80), 1);
});

test('heatAlpha: basamak tablosu, artan', () => {
  assert.equal(heatAlpha(null, 5), null);
  assert.equal(heatAlpha(0, 5), 0);
  assert.equal(heatAlpha(5, 5), HEAT_ALPHA[HEAT_LEVELS]);
  for (let i = 1; i < HEAT_ALPHA.length; i++) assert.ok(HEAT_ALPHA[i] > HEAT_ALPHA[i - 1]);
  assert.equal(HEAT_ALPHA.length, HEAT_LEVELS + 1);
});

test('heatStrong: yalnız 4 ve üstü', () => {
  assert.equal(heatStrong(null), false);
  assert.equal(heatStrong(3), false);
  assert.equal(heatStrong(4), true);
  assert.equal(heatStrong(5), true);
});

const INK = '#0A0A0A', WHITE = '#FFFFFF', NAVY = '#001F3F', CREAM = '#F7F2E9';
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

test('contrastRatio: siyah/beyaz 21, aynı renk 1', () => {
  assert.ok(Math.abs(contrastRatio(rgb('#000000'), rgb('#FFFFFF')) - 21) < 0.01);
  assert.equal(contrastRatio(rgb('#777777'), rgb('#777777')), 1);
});

test('heatInk: açık kobaltta her basamakta seçilen mürekkep ≥ 4.5:1', () => {
  for (let lv = 1; lv <= HEAT_LEVELS; lv++) {
    const a = HEAT_ALPHA[lv];
    const ink = heatInk('#4771AB', a, '#FFFFFF', [INK, WHITE]);
    const r = contrastRatio(composite('#4771AB', a, '#FFFFFF')!, rgb(ink));
    assert.ok(r >= 4.5, `basamak ${lv}: ${ink} ${r.toFixed(2)}`);
  }
  // eski hata: 4. basamakta beyaz ~3.3:1 → artık beyaz seçilmez
  assert.equal(heatInk('#4771AB', HEAT_ALPHA[4], '#FFFFFF', [INK, WHITE]), INK);
});

test('heatInk: koyu temada her basamakta ≥ 4.5:1 (lacivert / krem)', () => {
  for (let lv = 1; lv <= HEAT_LEVELS; lv++) {
    const a = HEAT_ALPHA[lv];
    const ink = heatInk('#93C5FD', a, '#1B1916', [CREAM, NAVY]);
    const r = contrastRatio(composite('#93C5FD', a, '#1B1916')!, rgb(ink));
    assert.ok(r >= 4.5, `basamak ${lv}: ${ink} ${r.toFixed(2)}`);
  }
  assert.equal(heatInk('#93C5FD', HEAT_ALPHA[1], '#1B1916', [CREAM, NAVY]), CREAM);
  assert.equal(heatInk('#93C5FD', HEAT_ALPHA[5], '#1B1916', [CREAM, NAVY]), NAVY);
});

test('heatInk: çözülemeyen renk → ilk aday', () => {
  assert.equal(heatInk('rgba(0,0,0,1)', 0.5, '#FFFFFF', [INK, WHITE]), INK);
});
