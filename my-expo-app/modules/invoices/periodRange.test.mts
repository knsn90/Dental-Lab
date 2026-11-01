// node --test modules/invoices/periodRange.test.mts — fatura listesi dönem süzgeci (muhasebeci dışa aktarımı)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, inPeriod } from './periodRange.ts';

test('tüm tarihler: sınır yok', () => {
  assert.deepEqual(periodRange('all', '2026-10-28'), { from: null, to: null });
});

test('bu ay: ayın ilk ve son günü', () => {
  assert.deepEqual(periodRange('this_month', '2026-10-28'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodRange('this_month', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
});

test('geçen ay: yılbaşı geçişinde önceki yılın aralığı', () => {
  assert.deepEqual(periodRange('last_month', '2026-10-28'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(periodRange('last_month', '2027-01-05'), { from: '2026-12-01', to: '2026-12-31' });
});

test('bu yıl', () => {
  assert.deepEqual(periodRange('this_year', '2026-10-28'), { from: '2026-01-01', to: '2026-12-31' });
});

test('özel aralık: ters girilirse sıralanır, eksik uç açık kalır', () => {
  assert.deepEqual(periodRange('custom', '2026-10-28', '2026-10-20', '2026-10-01'), { from: '2026-10-01', to: '2026-10-20' });
  assert.deepEqual(periodRange('custom', '2026-10-28', '2026-10-05', null), { from: '2026-10-05', to: null });
});

test('inPeriod: uçlar dahil', () => {
  const r = { from: '2026-10-01', to: '2026-10-31' };
  assert.equal(inPeriod('2026-10-01', r), true);
  assert.equal(inPeriod('2026-10-31', r), true);
  assert.equal(inPeriod('2026-11-01', r), false);
  assert.equal(inPeriod('2026-09-30', r), false);
  assert.equal(inPeriod('2026-05-05', { from: null, to: null }), true);
});
