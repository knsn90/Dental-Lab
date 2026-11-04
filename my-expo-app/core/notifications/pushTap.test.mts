// node --test core/notifications/pushTap.test.mts
// Telefon bildirimine dokununca açılacak yol + aynı dokunuşun iki kez işlenmemesi
// (uygulama bildirimle açıldığında hem dinleyici hem "son dokunuş" aynı yanıtı verebilir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapUrl, createTapRouter } from './pushTap.ts';

const resp = (id: string | undefined, data: Record<string, unknown> | null | undefined) =>
  ({ notification: { request: { identifier: id, content: { data } } } });

test('tapUrl: data.url uygulama içi yol', () => {
  assert.equal(tapUrl(resp('a', { url: '/order/x' })), '/order/x');
  assert.equal(tapUrl(resp('a', { url: ' /(lab)/clinics?tab=reviews&focus=w ' })), '/(lab)/clinics?tab=reviews&focus=w');
});

test('tapUrl: bağlantı yoksa ya da dış adresse null', () => {
  assert.equal(tapUrl(resp('a', {})), null);
  assert.equal(tapUrl(resp('a', null)), null);
  assert.equal(tapUrl(resp('a', { url: '' })), null);
  assert.equal(tapUrl(resp('a', { url: 'https://evil.example' })), null);
  assert.equal(tapUrl(resp('a', { url: '//evil.example' })), null);
  assert.equal(tapUrl({} as any), null);
  assert.equal(tapUrl(null), null);
});

test('aynı bildirim iki kez gelirse bir kez gidilir', () => {
  const went: string[] = [];
  const handle = createTapRouter((u) => went.push(u));
  assert.equal(handle(resp('n1', { url: '/order/1' })), true);
  assert.equal(handle(resp('n1', { url: '/order/1' })), false);
  assert.deepEqual(went, ['/order/1']);
});

test('farklı bildirimler ayrı ayrı açılır', () => {
  const went: string[] = [];
  const handle = createTapRouter((u) => went.push(u));
  handle(resp('n1', { url: '/order/1' }));
  handle(resp('n2', { url: '/order/2' }));
  assert.deepEqual(went, ['/order/1', '/order/2']);
});

test('bağlantısız bildirim gezinmez', () => {
  const went: string[] = [];
  const handle = createTapRouter((u) => went.push(u));
  assert.equal(handle(resp('n1', {})), false);
  assert.deepEqual(went, []);
});

test('gezinme hata verirse çökmez', () => {
  const handle = createTapRouter(() => { throw new Error('router yok'); });
  assert.equal(handle(resp('n1', { url: '/order/1' })), false);
});
