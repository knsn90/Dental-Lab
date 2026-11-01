// node --test my-expo-app/core/data/countries.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, countryName, countryOptions, countryCodeFromName } from './countries.ts';

test('her dilde ülke adları tekil (açılır liste anahtarı) ve kodlar tekil', () => {
  for (const l of ['tr', 'en', 'de', 'fa'] as const) {
    const names = COUNTRIES.map((c) => c[l]);
    assert.equal(new Set(names).size, names.length, l);
  }
  assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
});

test('ad ↔ kod, Türkiye listenin başında', () => {
  assert.equal(countryName('DE', 'tr'), 'Almanya');
  assert.equal(countryName('ir', 'fa'), 'ایران');
  assert.equal(countryCodeFromName('Almanya', 'tr'), 'DE');
  assert.equal(countryOptions('en')[0].code, 'TR');
});
