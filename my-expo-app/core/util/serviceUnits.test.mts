// node --test core/util/serviceUnits.test.mts
// İş Tipi Dağılımı: hizmet adı eşleşmesi parantez ekine dayanıklı, aynı iş tek satırda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseServiceName, resolveUnitForWorkType, workTypeGroupLabel, unitShares } from './serviceUnits.ts';

const svc = new Map<string, string | null>([
  ['3d baskı gece plağı ( sprint ray )', 'Çene'],
  ['3d baskı geçici kron / köprü ( sprint ray )', 'Üye'],
  ['zirkon kron / köprü', 'Üye'],
]);

test('baseServiceName parantez ekini ve fazla boşluğu atar', () => {
  assert.equal(baseServiceName('3D baskı Gece Plağı ( Sprint Ray )'), '3D baskı Gece Plağı');
  assert.equal(baseServiceName('  Zirkon  Kron / Köprü '), 'Zirkon Kron / Köprü');
});

test('birebir eşleşme önceliklidir', () => {
  assert.equal(resolveUnitForWorkType('3D baskı Gece Plağı ( Sprint Ray )', svc), 'çene');
});

test('eksiz eski ad parantezli hizmetin birimini alır', () => {
  assert.equal(resolveUnitForWorkType('3D baskı Gece Plağı', svc), 'çene');
  assert.equal(resolveUnitForWorkType('3D baskı geçici kron / köprü', svc), 'üye');
});

test('tanınmayan hizmet yine null (varsayılana düşer)', () => {
  assert.equal(resolveUnitForWorkType('Bilinmeyen iş', svc), null);
});

test('workTypeGroupLabel ekli/eksiz ve tekrarlı adları tek etikete indirir', () => {
  assert.equal(workTypeGroupLabel('3D baskı geçici kron / köprü ( Sprint Ray )'), '3D baskı geçici kron / köprü');
  assert.equal(workTypeGroupLabel('3D baskı geçici kron / köprü, 3D baskı geçici kron / köprü'), '3D baskı geçici kron / köprü');
  assert.equal(workTypeGroupLabel('Zirkon Kron / Köprü, zirkon kron / köprü, Ti-Base Zirkon Kron / Köprü'), 'Zirkon Kron / Köprü, Ti-Base Zirkon Kron / Köprü');
});

test('unitShares her satırı yalnız kendi birim toplamına böler', () => {
  const s = unitShares([
    { count: 30, unit: 'üye' }, { count: 10, unit: null }, { count: 3, unit: 'çene' }, { count: 1, unit: 'Çene' },
  ]);
  assert.deepEqual(s, [0.75, 0.25, 0.75, 0.25]);
});

import { memberBucketOf, serviceUnitQty } from './serviceUnits.ts';

test('memberBucketOf: çene/adet ayrı kovada, bilinmeyen üye', () => {
  assert.equal(memberBucketOf('Çene'), 'cene');
  assert.equal(memberBucketOf('Vaka'), 'adet');
  assert.equal(memberBucketOf('Adet'), 'adet');
  assert.equal(memberBucketOf('Üye'), 'uye');
  assert.equal(memberBucketOf(null), 'uye');
});

test('gece plağı 16 diş → 1 çene, 16 üye DEĞİL', () => {
  const teeth = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28];
  assert.equal(memberBucketOf('çene'), 'cene');
  assert.equal(serviceUnitQty('çene', teeth), 1);
  assert.equal(serviceUnitQty('çene', [...teeth, 31, 41]), 2);
});
