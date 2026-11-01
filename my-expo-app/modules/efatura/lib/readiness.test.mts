// node --test my-expo-app/modules/efatura/lib/readiness.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clinicEFaturaGaps } from './readiness.ts';

const addr = JSON.stringify({ il: 'İstanbul', ilce: 'Ataşehir', mahalle: 'Atatürk Mah.' });

test('hazır klinik: VKN + vergi dairesi + il/ilçe', () => {
  assert.deepEqual(clinicEFaturaGaps({ vkn: '6091290810', tax_office: 'Kozyatağı', address: addr }), []);
  assert.deepEqual(clinicEFaturaGaps({ vkn: '10000000146', tax_office: 'Kadıköy', address: 'Moda Cad. 5, Kadıköy / İstanbul' }), []);
});

test('eksikler sunucu kurallarıyla aynı sırada', () => {
  assert.deepEqual(clinicEFaturaGaps({ vkn: null, tax_office: null, address: addr }), ['vkn', 'tax_office']);
  assert.deepEqual(clinicEFaturaGaps({ vkn: '12345', tax_office: 'X', address: addr }), ['vkn_invalid']);
  assert.deepEqual(clinicEFaturaGaps({ vkn: '609 129 0810', tax_office: 'X', address: JSON.stringify({ il: 'İzmir', ilce: '' }) }), ['address']);
  assert.deepEqual(clinicEFaturaGaps({ vkn: '6091290810', tax_office: ' ', address: 'Kadıköy' }), ['tax_office', 'address']);
  assert.deepEqual(clinicEFaturaGaps(null), ['vkn', 'tax_office', 'address']);
});

test('yurt dışı klinik: tek eksik "yurt dışı" (VKN/vergi dairesi istenmez)', () => {
  const de = JSON.stringify({ ulke: 'DE', il: 'Bayern', ilce: 'München', sokak: 'Leopoldstr. 12' });
  assert.deepEqual(clinicEFaturaGaps({ vkn: null, tax_office: null, address: de }), ['foreign']);
  assert.deepEqual(clinicEFaturaGaps({ vkn: null, tax_office: null, address: JSON.stringify({ ulke: 'TR', il: 'Ankara', ilce: 'Çankaya' }) }), ['vkn', 'tax_office']);
});
