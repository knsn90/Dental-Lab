// node --test modules/dashboard/lib/distributions.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error TS5097
import { workTypeDistribution, unitMapOf, statusBuckets } from './distributions.ts';

test('workTypeDistribution: iptal/dişsiz yok, çene kendi biriminde', () => {
  const units = unitMapOf([{ name: 'Zirkon', unit: 'Üye' }, { name: 'Gece Plağı', unit: 'Çene' }]);
  const rows = workTypeDistribution([
    { work_type: 'Zirkon', status: 'uretimde', tooth_numbers: [11, 12, 13] },
    { work_type: 'Zirkon', status: 'iptal', tooth_numbers: [21] },
    { work_type: 'Zirkon', status: 'alindi', tooth_numbers: [] },
    { work_type: 'Gece Plağı', status: 'alindi', tooth_numbers: [11, 21, 31] },
  ], units);
  assert.deepEqual(rows.map((r) => [r.label, r.count]), [['Zirkon', 3], ['Gece Plağı', 2]]);
});

test('statusBuckets: kova eşlemesi, bilinmeyen atlanır', () => {
  assert.deepEqual(
    statusBuckets({ alindi: 2, kutu_atandi: 1, uretimde: 4, iptal: 9 }, ['alindi', 'uretimde'], { alindi: 'alindi', kutu_atandi: 'alindi', uretimde: 'uretimde' }),
    { alindi: 3, uretimde: 4 },
  );
});
