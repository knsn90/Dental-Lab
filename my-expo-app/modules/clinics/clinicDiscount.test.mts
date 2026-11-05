// node --test modules/clinics/clinicDiscount.test.mts
// Klinik indirim oranı kaydı — upsert anahtarı tablonun gerçek benzersiz anahtarı olmalı.
// Canlı: clinic_discounts UNIQUE (lab_id, clinic_id); 'clinic_id' tek başına 42P10 veriyordu
// (her kayıt başarısız, tablo boş — 2026-11-05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClinicRate, clinicDiscountUpsert, parseDiscountPercent } from './clinicDiscount.ts';

test('upsert benzersiz anahtar (lab_id, clinic_id) ile yapılır', () => {
  const { onConflict } = clinicDiscountUpsert({ id: 'c1', lab_id: 'l1' }, 10);
  assert.equal(onConflict, 'lab_id,clinic_id');
});

test('satır kliniğin lab_id değerini taşır', () => {
  const { row } = clinicDiscountUpsert({ id: 'c1', lab_id: 'l1' }, 12.5);
  assert.deepEqual(row, { lab_id: 'l1', clinic_id: 'c1', discount_rate: 12.5 });
});

test('lab_id bilinmiyorsa gönderilmez (veritabanı varsayılanı get_my_lab_id doldurur)', () => {
  const { row } = clinicDiscountUpsert({ id: 'c1' }, 5);
  assert.deepEqual(row, { clinic_id: 'c1', discount_rate: 5 });
  assert.equal(clinicDiscountUpsert({ id: 'c1', lab_id: null }, 5).row.lab_id, undefined);
});

test('oran: virgül ve nokta, 0–100 arası', () => {
  assert.equal(parseDiscountPercent('10'), 10);
  assert.equal(parseDiscountPercent('7,5'), 7.5);
  assert.equal(parseDiscountPercent(' 0 '), 0);
  assert.equal(parseDiscountPercent('100'), 100);
});

test('oran: geçersiz değerler null', () => {
  assert.equal(parseDiscountPercent(''), null);
  assert.equal(parseDiscountPercent('abc'), null);
  assert.equal(parseDiscountPercent('-1'), null);
  assert.equal(parseDiscountPercent('100.01'), null);
});

test('genel oran SQL ROUND ile aynı', () => {
  assert.equal(applyClinicRate(1250.50, 15), 1062.93); // 1062.925
  assert.equal(applyClinicRate(100.10, 15), 85.09);    // 85.085 (float 85.0849… tuzağı)
  assert.equal(applyClinicRate(99.99, 7.5), 92.49);    // 92.49075
  assert.equal(applyClinicRate(100, 0), 100);
  assert.equal(applyClinicRate(0, 10), 0);
  assert.equal(applyClinicRate(1.05, 50), 0.53);       // 0.525
});
