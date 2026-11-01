// node --test my-expo-app/modules/orders/lib/patientAge.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFromDob, parseAgeInput, sanitizeAgeInput, orderAge } from './patientAge.ts';

const now = new Date('2026-10-19T12:00:00Z');

test('doğum tarihinden yaş: doğum günü geçtiyse/geçmediyse doğru', () => {
  assert.equal(ageFromDob('1980-10-19', now), 46);
  assert.equal(ageFromDob('1980-10-20', now), 45);
  assert.equal(ageFromDob('2026-01-01', now), 0);
  assert.equal(ageFromDob(new Date('1990-05-05T00:00:00'), now), 36);
});

test('doğum tarihinden yaş: boş, bozuk ya da gelecek tarih → null', () => {
  assert.equal(ageFromDob(null, now), null);
  assert.equal(ageFromDob('', now), null);
  assert.equal(ageFromDob('bozuk', now), null);
  assert.equal(ageFromDob('2030-01-01', now), null);
});

test('yaş girdisi: 0–120 tam sayı kabul, diğerleri null', () => {
  assert.equal(parseAgeInput('45'), 45);
  assert.equal(parseAgeInput(' 7 '), 7);
  assert.equal(parseAgeInput('0'), 0);
  assert.equal(parseAgeInput('120'), 120);
  assert.equal(parseAgeInput('121'), null);
  assert.equal(parseAgeInput(''), null);
  assert.equal(parseAgeInput('4.5'), null);
  assert.equal(parseAgeInput('-3'), null);
  assert.equal(parseAgeInput('abc'), null);
});

test('yazarken yalnız rakam, en fazla 3 hane', () => {
  assert.equal(sanitizeAgeInput('4a5'), '45');
  assert.equal(sanitizeAgeInput('1234'), '123');
  assert.equal(sanitizeAgeInput('٤٥'), '45');   // Farsça/Arapça rakam
  assert.equal(sanitizeAgeInput('۴۵'), '45');
});

test('sipariş yaşı: kayıtlı yaş önce, yoksa eski siparişte doğum tarihinden', () => {
  assert.equal(orderAge({ patient_age: 52, patient_dob: '1980-01-01' }, now), 52);
  assert.equal(orderAge({ patient_age: null, patient_dob: '1980-01-01' }, now), 46);
  assert.equal(orderAge({ patient_age: null, patient_dob: null }, now), null);
  assert.equal(orderAge({}, now), null);
});
