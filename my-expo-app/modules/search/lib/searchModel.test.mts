// node --test my-expo-app/modules/search/lib/searchModel.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSearch, kindsForPanel, hrefFor, latestOnly, STALE, MIN_QUERY, DEBOUNCE_MS, isFresh } from './searchModel.ts';

test('en az 2 anlamlı karakter', () => {
  assert.equal(MIN_QUERY, 2);
  assert.equal(DEBOUNCE_MS, 250);
  assert.equal(shouldSearch(' a '), false);
  assert.equal(shouldSearch(''), false);
  assert.equal(shouldSearch('ay'), true);
});

test('panel ve menüye göre gruplar (spec §5.4)', () => {
  assert.deepEqual(kindsForPanel('admin', ['/(admin)/orders', '/(admin)/clinics', '/(admin)/finance']), ['orders', 'clinics', 'doctors', 'invoices']);
  assert.deepEqual(kindsForPanel('lab', ['/(lab)/all-orders', '/(lab)/clinics']), ['orders', 'clinics', 'doctors']);
  assert.deepEqual(kindsForPanel('lab', ['/(lab)/clinics']), ['clinics']);
  assert.deepEqual(kindsForPanel('clinic', ['/(clinic)/orders', '/(clinic)/finance']), ['orders', 'invoices']);
  assert.deepEqual(kindsForPanel('clinic', ['/(clinic)/finance']), ['invoices']);
  assert.deepEqual(kindsForPanel('doctor', ['/(doctor)/orders', '/(doctor)/finance']), ['orders', 'invoices']);
  assert.deepEqual(kindsForPanel('station', ['/(station)/orders']), ['orders']);
  assert.deepEqual(kindsForPanel('station', []), []);
});

test('sonuca tıklayınca gidilecek sayfa (spec §5.5)', () => {
  assert.equal(hrefFor('admin', 'orders', 'o1'), '/(admin)/order/o1');
  assert.equal(hrefFor('clinic', 'orders', 'o1'), '/(clinic)/order/o1');
  assert.equal(hrefFor('admin', 'clinics', 'c1'), '/(admin)/clinics?clinic=c1');
  assert.equal(hrefFor('lab', 'clinics', 'c1'), '/(lab)/clinics?clinic=c1');
  assert.equal(hrefFor('admin', 'doctors', 'd1'), '/(admin)/orders?doctor=d1');
  assert.equal(hrefFor('lab', 'doctors', 'd1'), '/(lab)/all-orders?doctor=d1');
  assert.equal(hrefFor('doctor', 'invoices', 'i1'), '/(doctor)/invoice/i1');
});

test('yalnız en son isteğin yanıtı geçer', async () => {
  const guard = latestOnly<string>();
  let releaseFirst!: (v: string) => void;
  const first = guard(new Promise<string>((r) => { releaseFirst = r; }));
  const second = guard(Promise.resolve('yeni'));
  assert.equal(await second, 'yeni');
  releaseFirst('eski');
  assert.equal(await first, STALE);
});

test('sonuç ancak ekrandaki sorgunun kendisine aitse geçerli (eski sonuç seçilemez)', () => {
  assert.equal(isFresh('NEX-2', 'NEX-24871'), false);
  assert.equal(isFresh('NEX-24871', ' NEX-24871 '), true);
  assert.equal(isFresh(null, 'ay'), false);
});
