// node --test modules/admin/workStats/formatStatNumber.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStatNumber } from './formatStatNumber.ts';

test('formatStatNumber: Farsça tam sayı ve ondalık aynı rakamlarla', () => {
  const loc = 'fa-IR-u-ca-persian';
  const int = formatStatNumber(42, 0, loc);
  const dec = formatStatNumber(12.5, 1, loc);
  assert.ok(/[۰-۹]/.test(int) && !/[0-9]/.test(int), int);
  assert.ok(/[۰-۹]/.test(dec) && !/[0-9]/.test(dec), dec);
});

test('formatStatNumber: tam sayı yuvarlanır, ondalık sabit hane', () => {
  assert.equal(formatStatNumber(41.6, 0, 'en-US'), '42');
  assert.equal(formatStatNumber(12, 1, 'en-US'), '12.0');
  assert.equal(formatStatNumber(4321, 0, 'tr-TR'), '4.321');
});
