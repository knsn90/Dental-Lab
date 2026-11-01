// node --test my-expo-app/modules/search/lib/fold.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldTR } from './fold.ts';

test('Türkçe harf + büyük/küçük katlama veritabanındaki search_fold ile aynı', () => {
  assert.equal(foldTR('İsmail IŞIK Ayşe Çağla Öz Üstün'), 'ismail isik ayse cagla oz ustun');
  assert.equal(foldTR('AYŞE'), foldTR('ayse'));
  assert.equal(foldTR('Âlim Îmâ Ûmut'), 'alim ima umut');
  assert.equal(foldTR(''), '');
});
