// node --test my-expo-app/supabase/functions/_shared/bbkProof.test.ts
// BanaBiKurye (Borzo 1.8) sipariş nesnesinden teslim kanıtını çıkaran saf fonksiyon.
// Fixture'lar uydurmadır (gerçek kişi/sipariş yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBbkProof, hasAnyProof } from './bbkProof.ts';

const point = (over: Record<string, unknown> = {}) => ({
  point_id: 1, address: 'x', is_return_point: false,
  checkin: null, place_photo_url: null, sign_photo_url: null, courier_visit_datetime: null,
  ...over,
});

test('teslim noktası son noktadır: ad + varış dolu, fotoğraflar boş dize → null', () => {
  const order = {
    order_id: 7, status: 'completed',
    points: [
      point({ checkin: { recipient_full_name: 'Alım Kişisi', recipient_position: '' }, courier_visit_datetime: '2026-10-28T09:00:00+03:00' }),
      point({ checkin: { recipient_full_name: 'Test Alıcı', recipient_position: '' }, place_photo_url: '', sign_photo_url: '', courier_visit_datetime: '2026-10-28T10:30:00+03:00' }),
    ],
  };
  const p = extractBbkProof(order);
  assert.deepEqual(p, {
    recipientName: 'Test Alıcı', recipientTitle: null, visitAt: '2026-10-28T10:30:00+03:00',
    placePhotoUrl: null, signPhotoUrl: null,
  });
  assert.equal(hasAnyProof(p), true);
});

test('son nokta dönüş noktasıysa ondan önceki nokta kullanılır', () => {
  const order = {
    points: [
      point(),
      point({ checkin: { recipient_full_name: 'Teslim Alan' }, sign_photo_url: 'https://cdn.example/s.jpg' }),
      point({ is_return_point: true, checkin: { recipient_full_name: 'Dönüş' } }),
    ],
  };
  const p = extractBbkProof(order);
  assert.equal(p?.recipientName, 'Teslim Alan');
  assert.equal(p?.signPhotoUrl, 'https://cdn.example/s.jpg');
});

test('checkin yok ve alanlar boş → kanıt yok', () => {
  const p = extractBbkProof({ points: [point(), point({ checkin: null })] });
  assert.ok(p);
  assert.equal(hasAnyProof(p), false);
});

test('yalnız boşluk dizeleri null sayılır', () => {
  const p = extractBbkProof({ points: [point(), point({ checkin: { recipient_full_name: '   ', recipient_position: ' ' }, place_photo_url: '  ' })] });
  assert.equal(p?.recipientName, null);
  assert.equal(p?.recipientTitle, null);
  assert.equal(p?.placePhotoUrl, null);
});

test('nokta yoksa ya da sipariş boşsa null', () => {
  assert.equal(extractBbkProof(null), null);
  assert.equal(extractBbkProof({}), null);
  assert.equal(extractBbkProof({ points: [] }), null);
  assert.equal(hasAnyProof(null), false);
});
