// node --test my-expo-app/supabase/functions/_shared/shipinkAddress.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clinicAddressParts } from './shipinkAddress.ts';

test('klinik JSON adresi (METİN olarak saklanır) parçalanır; bina ve daire sokak satırında', () => {
  const raw = JSON.stringify({ ulke: 'TR', il: 'İstanbul', ilce: 'Ataşehir', mahalle: 'Atatürk', sokak: 'Vatan Cad.', bina_no: '21', daire_no: '3', posta_kodu: '34758' });
  assert.deepEqual(clinicAddressParts(raw), {
    street: 'Atatürk Mah. Vatan Cad. No: 21 D: 3', city: 'Ataşehir', state: 'İstanbul', zip: '34758', country: 'TR',
  });
});

test('daire yoksa yalnız bina; "Mah." zaten yazılıysa tekrarlanmaz; ülke yoksa TR', () => {
  const raw = JSON.stringify({ il: 'Ankara', ilce: 'Çankaya', mahalle: 'Kızılay Mah.', sokak: 'Atatürk Blv.', bina_no: '5' });
  assert.deepEqual(clinicAddressParts(raw), { street: 'Kızılay Mah. Atatürk Blv. No: 5', city: 'Çankaya', state: 'Ankara', zip: '', country: 'TR' });
});

test('nesne olarak gelen adres ve eski anahtarlar (adres/street/city/district/zip) da okunur', () => {
  assert.deepEqual(clinicAddressParts({ il: 'İzmir', ilce: 'Bornova', sokak: '1203 Sk.', bina_no: '7', daire_no: '2' }),
    { street: '1203 Sk. No: 7 D: 2', city: 'Bornova', state: 'İzmir', zip: '', country: 'TR' });
  assert.deepEqual(clinicAddressParts({ city: 'Bursa', district: 'Nilüfer', street: 'FSM Blv. 10', zip: '16110' }),
    { street: 'FSM Blv. 10', city: 'Nilüfer', state: 'Bursa', zip: '16110', country: 'TR' });
});

test('yurt dışı: "Mah." eklenmez, ülke kodu döner', () => {
  const raw = JSON.stringify({ ulke: 'de', il: 'Bayern', ilce: 'München', sokak: 'Leopoldstraße', bina_no: '12', daire_no: '4' });
  assert.deepEqual(clinicAddressParts(raw), { street: 'Leopoldstraße No: 12 D: 4', city: 'München', state: 'Bayern', zip: '', country: 'DE' });
});

test('düz metin adres yalnız sokak olur; boş/bozuk değer null', () => {
  assert.deepEqual(clinicAddressParts('Moda Cad. 5, Kadıköy / İstanbul'), { street: 'Moda Cad. 5, Kadıköy / İstanbul', city: '', state: '', zip: '', country: '' });
  assert.equal(clinicAddressParts(''), null);
  assert.equal(clinicAddressParts(null), null);
  assert.deepEqual(clinicAddressParts('{bozuk'), { street: '{bozuk', city: '', state: '', zip: '', country: '' });
});
