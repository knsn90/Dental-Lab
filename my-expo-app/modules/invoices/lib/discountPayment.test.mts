import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDiscountPayment, discountPaymentDocNo, discountPaymentLabel, clinicCollected,
} from './discountPayment.ts';

test('isDiscountPayment: yöntem ya da bağ', () => {
  assert.equal(isDiscountPayment({ payment_method: 'indirim' }), true);
  assert.equal(isDiscountPayment({ payment_method: 'nakit', statement_discount_id: 'x' }), true);
  assert.equal(isDiscountPayment({ payment_method: 'nakit', statement_discount_id: null }), false);
  assert.equal(isDiscountPayment({ payment_method: null }), false);
});

test('discountPaymentDocNo: notes içinden İND-n', () => {
  assert.equal(discountPaymentDocNo('İND-12'), 12);
  assert.equal(discountPaymentDocNo('not · İND-3 · x'), 3);
  assert.equal(discountPaymentDocNo('ind-7'), 7);
  assert.equal(discountPaymentDocNo('IND-9'), 9);
  assert.equal(discountPaymentDocNo(''), null);
  assert.equal(discountPaymentDocNo(null), null);
  assert.equal(discountPaymentDocNo('İND-'), null);
});

test('discountPaymentLabel', () => {
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'İND-5'), 'Ekstre indirimi İND-5');
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'x'), 'Ekstre indirimi');
  assert.equal(discountPaymentLabel('Ekstre indirimi', undefined), 'Ekstre indirimi');
});

test('discountPaymentLabel: DZ payı "Düzeltme belgesi DZ-n"', () => {
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'DZ-4'), 'Düzeltme belgesi DZ-4');
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'DZ-4', ' · '), 'Düzeltme belgesi · DZ-4');
  assert.equal(discountPaymentLabel('Statement discount', 'DZ-12', ' ', 'Correction document'), 'Correction document DZ-12');
  // yalnız tam "DZ-n" notu (isCorrectionShare ile aynı)
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'xDZ-4'), 'Ekstre indirimi');
  assert.equal(discountPaymentLabel('Ekstre indirimi', 'İND-2'), 'Ekstre indirimi İND-2');
});

test('clinicCollected: ödenen + avans - indirim', () => {
  assert.equal(clinicCollected({ total_paid: 100, unallocated_credit: 20, statement_discount_total: 30 }), 90);
  assert.equal(clinicCollected({ total_paid: 100 }), 100);
  assert.equal(clinicCollected({ total_paid: '50' as any, unallocated_credit: null, statement_discount_total: undefined }), 50);
  assert.equal(clinicCollected({ total_paid: 10, statement_discount_total: 25 }), 0);
});

test('discountPaymentDocNo: gömülü önek sayılmaz (sol sınır)', () => {
  assert.equal(discountPaymentDocNo('WIND-5'), null);
  assert.equal(discountPaymentDocNo('xİND-5'), null);
  assert.equal(discountPaymentDocNo('9IND-5'), null);
  assert.equal(discountPaymentDocNo('(İND-5)'), 5);
  assert.equal(discountPaymentDocNo('a İND-5'), 5);
});
