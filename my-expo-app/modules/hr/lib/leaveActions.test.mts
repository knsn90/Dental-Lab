// node --test my-expo-app/modules/hr/lib/leaveActions.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsChanged, canDeleteLeave } from './leaveActions.ts';

test('RLS satırı süzdüyse (0 satır) işlem uygulanmamış sayılır', () => {
  assert.equal(rowsChanged([]), false);
  assert.equal(rowsChanged(null), false);
  assert.equal(rowsChanged(undefined), false);
  assert.equal(rowsChanged([{ id: 'x' }]), true);
});

test('onay yetkisi olmayan yalnız bekleyen ya da iptal edilmiş izni silebilir', () => {
  assert.equal(canDeleteLeave('bekliyor', false), true);
  assert.equal(canDeleteLeave('iptal', false), true);
  assert.equal(canDeleteLeave('onaylandi', false), false);
  assert.equal(canDeleteLeave('reddedildi', false), false);
});

test('onay yetkilisi her durumdaki izni silebilir', () => {
  for (const s of ['bekliyor', 'iptal', 'onaylandi', 'reddedildi']) {
    assert.equal(canDeleteLeave(s, true), true);
  }
});
