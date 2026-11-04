// node --test supabase/functions/_shared/pushData.test.ts
// Push'a dokununca açılacak bağlantı: DB göndericileri bağlantıyı payload.actionUrl'e
// koyar, telefon (expo) ve tarayıcı (sw.js) ise data.url okur. pushData ikisini eşler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushData } from './pushData.ts';

test('DB göndericisi: actionUrl data.url olur', () => {
  assert.deepEqual(
    pushData({ title: 'T', actionUrl: '/order/abc', resourceType: 'work_order', resourceId: 'abc' }),
    { url: '/order/abc' },
  );
});

test('sorgu dizgesi korunur (düşük puan bağlantısı)', () => {
  assert.deepEqual(
    pushData({ title: 'T', actionUrl: '/(lab)/clinics?tab=reviews&focus=w1' }),
    { url: '/(lab)/clinics?tab=reviews&focus=w1' },
  );
});

test('istemci göndericisi: mevcut data.url ve diğer alanlar olduğu gibi kalır', () => {
  const data = { url: '/(lab)/order/x', category: 'new_order', payload: { a: 1 } };
  assert.deepEqual(pushData({ title: 'T', data, actionUrl: '/order/y' }), data);
});

test('boş ya da bağlantısız bildirim: url eklenmez', () => {
  assert.deepEqual(pushData({ title: 'T', actionUrl: '' }), {});
  assert.deepEqual(pushData({ title: 'T', actionUrl: '   ' }), {});
  assert.deepEqual(pushData({ title: 'T' }), {});
  assert.deepEqual(pushData({ title: 'T', actionUrl: null }), {});
});

test('yalnız uygulama içi yol: dış adres ve // ile başlayan adres alınmaz', () => {
  assert.deepEqual(pushData({ title: 'T', actionUrl: 'https://evil.example/x' }), {});
  assert.deepEqual(pushData({ title: 'T', actionUrl: '//evil.example/x' }), {});
  assert.deepEqual(pushData({ title: 'T', actionUrl: 'javascript:alert(1)' }), {});
});

test('kenar boşlukları kırpılır', () => {
  assert.deepEqual(pushData({ title: 'T', actionUrl: '  /(station)/jobs ' }), { url: '/(station)/jobs' });
});

test('data.url boş dizgeyse actionUrl ile doldurulur', () => {
  assert.deepEqual(pushData({ title: 'T', data: { url: '', category: 'c' }, actionUrl: '/scans' }), { url: '/scans', category: 'c' });
});
