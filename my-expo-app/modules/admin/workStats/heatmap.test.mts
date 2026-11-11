// node --test modules/admin/workStats/heatmap.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatLevel, heatAlpha, heatStrong, HEAT_ALPHA, HEAT_LEVELS } from './heatmap.ts';

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
