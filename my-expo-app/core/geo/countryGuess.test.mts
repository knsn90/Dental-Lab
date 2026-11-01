// node --test my-expo-app/core/geo/countryGuess.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryFromTimeZone, countryFromLocale, pickCountry } from './countryGuess.ts';

test('saat diliminden ülke', () => {
  assert.equal(countryFromTimeZone('Europe/Istanbul'), 'TR');
  assert.equal(countryFromTimeZone('Asia/Tehran'), 'IR');
  assert.equal(countryFromTimeZone('Europe/Berlin'), 'DE');
  assert.equal(countryFromTimeZone('Asia/Baku'), 'AZ');
  assert.equal(countryFromTimeZone('Mars/Olympus'), null);
  assert.equal(countryFromTimeZone(undefined), null);
});

test('dil etiketinden bölge', () => {
  assert.equal(countryFromLocale('de-DE'), 'DE');
  assert.equal(countryFromLocale('fa_IR'), 'IR');
  assert.equal(countryFromLocale('tr'), null);
  assert.equal(countryFromLocale('en-001'), null);
});

test('öncelik: IP → saat dilimi → dil → Türkiye; geçersiz kod atlanır', () => {
  assert.equal(pickCountry({ ip: 'de', tz: 'Europe/Istanbul', locale: 'tr-TR' }), 'DE');
  assert.equal(pickCountry({ ip: null, tz: 'Asia/Tehran', locale: 'tr-TR' }), 'IR');
  const known = (c: string) => ['TR', 'DE', 'IR'].includes(c);
  assert.equal(pickCountry({ ip: 'XX', tz: 'Mars/Olympus', locale: 'fa-IR' }, known), 'IR');
  assert.equal(pickCountry({ ip: undefined, tz: undefined, locale: undefined }), 'TR');
});
