// node --test my-expo-app/core/utils/textCase.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCaseTR, normalizeDoctorName } from './textCase.ts';

test('mevcut davranış korunur', () => {
  assert.equal(titleCaseTR('ayşe kaya'), 'Ayşe Kaya');
  assert.equal(titleCaseTR('ışık özkan'), 'Işık Özkan');
  assert.equal(titleCaseTR('dr ayşe'), 'Dr. Ayşe');
  assert.equal(normalizeDoctorName('ayşe kaya'), 'Dt. Ayşe Kaya');
  assert.equal(normalizeDoctorName('Dr. Mustafa Enes Eren'), 'Dr. Mustafa Enes Eren');
  assert.equal(normalizeDoctorName('prof. dr. ali veli'), 'Prof. Dr. Ali Veli');
  assert.equal(normalizeDoctorName('dt ayşe kaya'), 'Dt. Ayşe Kaya');
});

test('noktadan sonra boşluksuz unvan ayrılır, ikinci "Dt." eklenmez', () => {
  assert.equal(titleCaseTR('dt.esra güllüoğlu'), 'Dt. Esra Güllüoğlu');
  assert.equal(normalizeDoctorName('dt.esra güllüoğlu'), 'Dt. Esra Güllüoğlu');
  assert.equal(normalizeDoctorName('Dr.ayşe kaya'), 'Dr. Ayşe Kaya');
});

test('tekrarlanan unvan teke indirilir', () => {
  assert.equal(normalizeDoctorName('Dt. Dt.esra Güllüoğlu'), 'Dt. Esra Güllüoğlu');
  assert.equal(normalizeDoctorName('Dt. Dt. Ayşe Kaya'), 'Dt. Ayşe Kaya');
  assert.equal(normalizeDoctorName('dr. dr. ali'), 'Dr. Ali');
});
