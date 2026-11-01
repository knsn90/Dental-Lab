// node --test my-expo-app/modules/auth/api/addressParts.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitStreetNumber, splitDaire, streetAndNumber } from './addressParts.ts';

test('"Cadde No:12" metni cadde + bina no olarak ayrılır', () => {
  assert.deepEqual(splitStreetNumber('Atatürk Cd. No:12'), { street: 'Atatürk Cd.', no: '12' });
  assert.deepEqual(splitStreetNumber('Vatan Caddesi No: 21/3'), { street: 'Vatan Caddesi', no: '21/3' });
  assert.deepEqual(splitStreetNumber('Moda Cad. no.5'), { street: 'Moda Cad.', no: '5' });
  assert.deepEqual(splitStreetNumber('Bağdat Cd.'), { street: 'Bağdat Cd.', no: '' });
  assert.deepEqual(splitStreetNumber(''), { street: '', no: '' });
});

test('Google bileşenleri: route + street_number (+ premise) ayrı alanlar', () => {
  assert.deepEqual(streetAndNumber({ route: 'Atatürk Caddesi', streetNumber: '12', premise: '' }), { cadde: 'Atatürk Caddesi', binaNo: '12', daireNo: '' });
  assert.deepEqual(streetAndNumber({ route: 'Ertuğrul Gazi Sk.', streetNumber: '2', premise: 'B Blok' }), { cadde: 'Ertuğrul Gazi Sk.', binaNo: '2 B Blok', daireNo: '' });
  // route yok, birleşik metin geldi (formattedAddress yedeği)
  assert.deepEqual(streetAndNumber({ route: '', streetNumber: '', premise: '', fallback: 'Yeni Sk. No:7' }), { cadde: 'Yeni Sk.', binaNo: '7', daireNo: '' });
  assert.deepEqual(streetAndNumber({ route: '', streetNumber: '', premise: 'Plaza 34' }), { cadde: '', binaNo: 'Plaza 34', daireNo: '' });
});

test('daire no: Google subpremise ya da metindeki "D:3" / "Daire 3" ayrı alana', () => {
  assert.deepEqual(splitDaire('Vatan Cd. No:21 D:3'), { rest: 'Vatan Cd. No:21', daire: '3' });
  assert.deepEqual(splitDaire('Moda Cad. No: 5 Daire 12'), { rest: 'Moda Cad. No: 5', daire: '12' });
  assert.deepEqual(splitDaire('Bağdat Cd. No:4, Kat 2 D. 7'), { rest: 'Bağdat Cd. No:4, Kat 2', daire: '7' });
  // "21/3" bina no olabilir — bölünmez
  assert.deepEqual(splitDaire('Vatan Caddesi No: 21/3'), { rest: 'Vatan Caddesi No: 21/3', daire: '' });
  // "D" ile biten sokak adları daire sanılmaz
  assert.deepEqual(splitDaire('Kemal Cd.'), { rest: 'Kemal Cd.', daire: '' });
  assert.deepEqual(streetAndNumber({ route: 'Leopoldstraße', streetNumber: '12', premise: '', subpremise: '4' }), { cadde: 'Leopoldstraße', binaNo: '12', daireNo: '4' });
  assert.deepEqual(streetAndNumber({ route: '', streetNumber: '', premise: '', fallback: 'Yeni Sk. No:7 D:2' }), { cadde: 'Yeni Sk.', binaNo: '7', daireNo: '2' });
});
