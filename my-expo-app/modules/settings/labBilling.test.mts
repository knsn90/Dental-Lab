// node --test my-expo-app/modules/settings/labBilling.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLabBilling, validateLabBilling, isLabBillingComplete, missingLabBillingFields,
  composeLabAddress, splitLegacyAddress, EMPTY_LAB_BILLING, type LabBilling,
} from './labBilling.ts';

const full: LabBilling = {
  legal_name: 'NEXADENT LABORATUVAR HİZMETLERİ SAN. TİC. LTD. ŞTİ.',
  tax_number: '6312098145',
  tax_office: 'Kozyatağı',
  street: 'Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2',
  district: 'Ataşehir',
  city: 'İstanbul',
  postal_code: '34750',
};

test('eksiksiz bilgi geçerli; posta kodu isteğe bağlı', () => {
  assert.deepEqual(validateLabBilling(full), {});
  assert.equal(isLabBillingComplete(full), true);
  assert.equal(isLabBillingComplete({ ...full, postal_code: '' }), true);
});

test('zorunlu alanlar: unvan, VKN, vergi dairesi, açık adres, ilçe, il', () => {
  const errs = validateLabBilling(EMPTY_LAB_BILLING);
  assert.deepEqual(Object.keys(errs).sort(), ['city', 'district', 'legal_name', 'street', 'tax_number', 'tax_office']);
  assert.deepEqual(missingLabBillingFields({ ...full, tax_office: '  ', city: '' }), ['tax_office', 'city']);
});

test('VKN 10 hane, TCKN (şahıs şirketi) 11 hane; boşluklar yok sayılır', () => {
  assert.equal(validateLabBilling({ ...full, tax_number: '12345678901' }).tax_number, undefined);
  assert.equal(validateLabBilling({ ...full, tax_number: '631 209 8145' }).tax_number, undefined);
  for (const bad of ['123', '63120981450123', '631209814A'])
    assert.ok(validateLabBilling({ ...full, tax_number: bad }).tax_number, bad);
});

test('posta kodu doluysa 5 hane olmalı', () => {
  assert.ok(validateLabBilling({ ...full, postal_code: '347' }).postal_code);
  assert.equal(validateLabBilling({ ...full, postal_code: '34750' }).postal_code, undefined);
});

test('normalize: null/undefined → boş metin, kenar boşlukları ve VKN boşlukları atılır', () => {
  const n = normalizeLabBilling({ legal_name: '  X  ', tax_number: '631 209 8145', city: null, district: undefined } as any);
  assert.equal(n.legal_name, 'X');
  assert.equal(n.tax_number, '6312098145');
  assert.equal(n.city, '');
  assert.equal(n.district, '');
});

test('görünen adres yapılandırılmış alanlardan oluşur ("…, İlçe / İl" — klinik adresiyle aynı biçim)', () => {
  assert.equal(composeLabAddress(full), 'Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir / İstanbul');
  assert.equal(composeLabAddress({ ...full, street: '' }), 'Ataşehir / İstanbul');
  assert.equal(composeLabAddress(EMPTY_LAB_BILLING), '');
});

test('eski serbest adresten ilk doldurma', () => {
  assert.deepEqual(splitLegacyAddress('Atatürk Mah. Vatan Cad. No: 21, Ataşehir / İstanbul'),
    { street: 'Atatürk Mah. Vatan Cad. No: 21', district: 'Ataşehir', city: 'İstanbul' });
  // Biçim tutmuyorsa hepsi açık adrese gider, il/ilçe kullanıcıya kalır.
  assert.deepEqual(splitLegacyAddress('Fatih Cd. No:12, Beylikdüzü'), { street: 'Fatih Cd. No:12, Beylikdüzü', district: '', city: '' });
  assert.deepEqual(splitLegacyAddress(null), { street: '', district: '', city: '' });
});
