// node --test modules/invoices/lib/correctionDoc.test.mts — düzeltme belgesi (DZ) saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionDocNo, correctionCap, correctionSplit, validateCorrection, dzErrorText, isCorrectionShare } from './correctionDoc.ts';

test('DZ numarası', () => { assert.equal(correctionDocNo(17), 'DZ-17'); });
test('kalem tavanı', () => {
  assert.equal(correctionCap(500, 200), 300);
  assert.equal(correctionCap(500, 600), 0);
});
test('fatura/alacak bölüşümü', () => {
  assert.deepEqual(correctionSplit({ invoiceTotal: 600, paidAmount: 200, amount: 500 }), { toInvoice: 400, toCredit: 100 });
  assert.deepEqual(correctionSplit({ invoiceTotal: 600, paidAmount: 600, amount: 50 }), { toInvoice: 0, toCredit: 50 });
  assert.deepEqual(correctionSplit({ invoiceTotal: 0.1 + 0.2, paidAmount: 0, amount: 1.005 }), { toInvoice: 0.3, toCredit: 0.71 });
});
test('doğrulama sırası', () => {
  assert.equal(validateCorrection({ amount: 0, reason: 'x', cap: 10 }), 'DZ_VALUE');
  assert.equal(validateCorrection({ amount: 11, reason: 'x', cap: 10 }), 'DZ_CAP');
  assert.equal(validateCorrection({ amount: 5, reason: '  ', cap: 10 }), 'DZ_REASON');
  assert.equal(validateCorrection({ amount: 5, reason: 'ok', cap: 10 }), null);
  assert.equal(validateCorrection({ amount: 11, reason: '', cap: 10 }), 'DZ_CAP');
});
test('hata metinleri', () => {
  assert.equal(dzErrorText('DZ_CAP'), 'Tutar, kalemin kalan tutarını aşamaz.');
  assert.equal(dzErrorText('DZ_VALUE'), "Tutar 0'dan büyük olmalı.");
  assert.equal(dzErrorText('DZ_DELETE_LOCKED'), 'Düzeltme belgesi silinemez. Fazla yazıldıysa ek fatura kesin.');
  assert.equal(dzErrorText('zzz'), 'Düzeltme belgesi kaydedilemedi.');
  assert.equal(dzErrorText(null), 'Düzeltme belgesi kaydedilemedi.');
});
test('DZ payı ayırt edilir', () => {
  assert.equal(isCorrectionShare({ payment_method: 'indirim', notes: 'DZ-3' }), true);
  assert.equal(isCorrectionShare({ payment_method: 'indirim', notes: 'İND-3' }), false);
  assert.equal(isCorrectionShare({ payment_method: 'nakit', notes: 'DZ-3' }), false);
  assert.equal(isCorrectionShare({ payment_method: 'indirim' }), false);
});
