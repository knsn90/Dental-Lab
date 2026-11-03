// node --test my-expo-app/supabase/functions/_shared/brandLab.test.ts
// Sistem e-postasında markanın (logo + ad) hangi lab'dan alınacağı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandLabIdFor } from './brandLab.ts';

test('sipariş varsa marka siparişin lab\'ı', () => {
  assert.equal(brandLabIdFor('lab-a', ['lab-b', 'lab-b']), 'lab-a');
});

test('sipariş yoksa ve alıcılar tek lab\'daysa marka o lab (günlük iş takibi, stok sayımı)', () => {
  assert.equal(brandLabIdFor(null, ['lab-a', 'lab-a', null]), 'lab-a');
});

test('alıcılar farklı lab\'lardaysa marka yok (yanlış lab adı yazılmaz)', () => {
  assert.equal(brandLabIdFor(null, ['lab-a', 'lab-b']), null);
});

test('alıcıların lab\'ı yoksa marka yok', () => {
  assert.equal(brandLabIdFor(null, [null, null]), null);
  assert.equal(brandLabIdFor(null, []), null);
});
