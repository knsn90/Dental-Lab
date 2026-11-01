// node --test my-expo-app/core/util/formatAddressCore.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAddressWith } from './formatAddressCore.ts';

const names: Record<string, Record<string, string>> = { tr: { DE: 'Almanya' }, en: { DE: 'Germany' } };
const formatAddress = (raw: string | null, lang = 'tr') => formatAddressWith(raw, (c) => names[lang]?.[c] ?? c);

test('Türkiye JSON adresi eskisi gibi (ülke yazılmaz)', () => {
  const a = JSON.stringify({ il: 'İstanbul', ilce: 'Ataşehir', mahalle: 'Atatürk', sokak: 'Vatan Cad.', bina_no: '21', posta_kodu: '34758' });
  assert.equal(formatAddress(a), 'Vatan Cad. No: 21, Atatürk Mah., Ataşehir/İstanbul, 34758');
  assert.equal(formatAddress(JSON.stringify({ ulke: 'TR', il: 'Ankara', ilce: 'Çankaya' })), 'Çankaya/Ankara');
});

test('yurt dışı: "Mah." eklenmez, ülke adı sonda', () => {
  const a = JSON.stringify({ ulke: 'DE', il: 'Bayern', ilce: 'München', sokak: 'Leopoldstraße', bina_no: '12', posta_kodu: '80802' });
  assert.equal(formatAddress(a, 'tr'), 'Leopoldstraße No: 12, München, Bayern, 80802, Almanya');
  assert.equal(formatAddress(a, 'en'), 'Leopoldstraße No: 12, München, Bayern, 80802, Germany');
});

test('düz metin ve bozuk JSON olduğu gibi', () => {
  assert.equal(formatAddress('Moda Cad. 5, Kadıköy / İstanbul'), 'Moda Cad. 5, Kadıköy / İstanbul');
  assert.equal(formatAddress('{bozuk'), '{bozuk');
  assert.equal(formatAddress(null), '');
});

test('daire no: "No: 21 D: 3" (TR ve yurt dışı); bina yoksa yalnız "D: 3"', () => {
  const tr = JSON.stringify({ il: 'İstanbul', ilce: 'Ataşehir', mahalle: 'Atatürk', sokak: 'Vatan Cad.', bina_no: '21', daire_no: '3' });
  assert.equal(formatAddress(tr), 'Vatan Cad. No: 21 D: 3, Atatürk Mah., Ataşehir/İstanbul');
  const de = JSON.stringify({ ulke: 'DE', ilce: 'München', sokak: 'Leopoldstraße', bina_no: '12', daire_no: '4' });
  assert.equal(formatAddress(de), 'Leopoldstraße No: 12 D: 4, München, Almanya');
  assert.equal(formatAddress(JSON.stringify({ il: 'Ankara', ilce: 'Çankaya', sokak: 'Tunalı Cad.', daire_no: '7' })), 'Tunalı Cad. D: 7, Çankaya/Ankara');
});
