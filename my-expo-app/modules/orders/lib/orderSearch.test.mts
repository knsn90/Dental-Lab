// node --test my-expo-app/modules/orders/lib/orderSearch.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesOrderSearch } from './orderSearch.ts';
import { foldTR } from '../../search/lib/fold.ts';

const O = {
  order_number: 'NEX-24871', patient_name: 'AYŞE K.', work_type: 'Zirkonya',
  doctor: { full_name: 'Dt. Mert A.', clinic: { name: 'Gülüş Kliniği' } },
};

test('klinik adıyla da bulunur (bugün bulunmuyordu)', () => {
  assert.equal(matchesOrderSearch(O, 'gulus', foldTR), true);
  assert.equal(matchesOrderSearch(O, 'Gülüş', foldTR), true);
});

test('hasta, sipariş no, hekim, iş tipi — Türkçe harf katlamasıyla', () => {
  assert.equal(matchesOrderSearch(O, 'ayse', foldTR), true);
  assert.equal(matchesOrderSearch(O, '248', foldTR), true);
  assert.equal(matchesOrderSearch(O, 'mert', foldTR), true);
  assert.equal(matchesOrderSearch(O, 'zirk', foldTR), true);
});

test('boş arama hepsini, eşleşmeyen hiçbirini', () => {
  assert.equal(matchesOrderSearch(O, '', foldTR), true);
  assert.equal(matchesOrderSearch(O, 'yok', foldTR), false);
  assert.equal(matchesOrderSearch({ order_number: 'X-1' }, 'gulus', foldTR), false);
});
