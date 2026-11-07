// node --test modules/invoices/lib/correctionDoc.test.mts — düzeltme belgesi (DZ) saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionDocNo, correctionCap, correctionSplit, validateCorrection, dzErrorText, isCorrectionShare,
  correctionItemShare, correctionMaxAmount, effectiveDiscountAmount, withEffectiveDiscounts,
} from './correctionDoc.ts';

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
test('yuvarlama büyük tutarda da yarım değeri yukarı alır', () => {
  assert.deepEqual(correctionSplit({ invoiceTotal: 0, paidAmount: 0, amount: 1000.005 }), { toInvoice: 0, toCredit: 1000.01 });
});
test('0\'a yuvarlanan tutar DZ_VALUE', () => {
  assert.equal(validateCorrection({ amount: 0.004, reason: 'x', cap: 10 }), 'DZ_VALUE');
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
  assert.equal(dzErrorText('DZ_ZZZ'), 'Düzeltme belgesi kaydedilemedi.');
  assert.equal(dzErrorText('SD_PAYMENT_MISMATCH'), 'Düzeltme belgesi kaydedilemedi.');
  assert.equal(dzErrorText('error'), 'Düzeltme belgesi kaydedilemedi.');
  assert.equal(dzErrorText(''), 'Düzeltme belgesi kaydedilemedi.');
  assert.equal(dzErrorText(null), 'Düzeltme belgesi kaydedilemedi.');
});
test('kodsuz sunucu mesajı olduğu gibi geçer', () => {
  assert.equal(dzErrorText('Yetkiniz yok'), 'Yetkiniz yok');
  assert.equal(dzErrorText('Kalem bulunamadı'), 'Kalem bulunamadı');
});
test('DZ payı ayırt edilir', () => {
  assert.equal(isCorrectionShare({ payment_method: 'indirim', notes: 'DZ-3' }), true);
  assert.equal(isCorrectionShare({ payment_method: 'indirim', notes: 'İND-3' }), false);
  assert.equal(isCorrectionShare({ payment_method: 'nakit', notes: 'DZ-3' }), false);
  assert.equal(isCorrectionShare({ payment_method: 'indirim' }), false);
});

test('kalemin fatura toplamındaki payı (SQL ile aynı oran)', () => {
  // 500 + 500, fatura altı %20 → total 800: her kalemin payı 400
  assert.equal(correctionItemShare(500, 800, 1000), 400);
  // indirimsiz: pay = net
  assert.equal(correctionItemShare(500, 600, 600), 500);
  // 1+1+1, total 2 → round(2/3, 2) = 0,67
  assert.equal(correctionItemShare(1, 2, 3), 0.67);
  // kalemsiz/sıfır toplam → 0 (SQL NULLIF → 0)
  assert.equal(correctionItemShare(500, 800, 0), 0);
  assert.equal(correctionItemShare(NaN as any, 800, 1000), 0);
});
test('DZ üst sınırı: kalem payı − kalemdeki DZ, fatura kalanı ile sınırlı', () => {
  const base = { itemNetTotal: 500, invoiceTotal: 800, sumNetTotal: 1000 };
  assert.equal(correctionMaxAmount({ ...base, priorOnItem: 0, priorOnInvoice: 0 }), 400);
  assert.equal(correctionMaxAmount({ ...base, priorOnItem: 0, priorOnInvoice: 400 }), 400);
  assert.equal(correctionMaxAmount({ ...base, priorOnItem: 400, priorOnInvoice: 800 }), 0);
  assert.equal(correctionMaxAmount({ ...base, priorOnItem: 100, priorOnInvoice: 100 }), 300);
  // fatura düzeyi: 0,67 + 0,67 yazılmış, üçüncü kalemde kalan 0,66
  assert.equal(correctionMaxAmount({ itemNetTotal: 1, invoiceTotal: 2, sumNetTotal: 3, priorOnItem: 0, priorOnInvoice: 1.34 }), 0.66);
  assert.equal(validateCorrection({ amount: 450, reason: 'x', cap: correctionMaxAmount({ ...base, priorOnItem: 0, priorOnInvoice: 0 }) }), 'DZ_CAP');
});

const invs = [
  { id: 'A', status: 'iptal', payments: [{ statement_discount_id: 'dz1', amount: 200 }, { statement_discount_id: 'dz2', amount: 50 }] },
  { id: 'B', status: 'kismi_odendi', payments: [{ statement_discount_id: 'dz2', amount: 100 }, { statement_discount_id: null, amount: 30 }] },
  { id: 'C', status: 'kesildi', payments: [{ statement_discount_id: 'dz3', amount: 40 }] },
];
test('iptal faturadaki DZ boştur: yalnız başka faturalara uygulanmış payı kalır', () => {
  assert.equal(effectiveDiscountAmount({ id: 'dz1', doc_type: 'DZ', invoice_id: 'A', amount: 200 }, invs), 0);
  assert.equal(effectiveDiscountAmount({ id: 'dz2', doc_type: 'DZ', invoice_id: 'A', amount: 150 }, invs), 100);
  // iptal olmayan faturada DZ ve İND aynen
  assert.equal(effectiveDiscountAmount({ id: 'dz3', doc_type: 'DZ', invoice_id: 'C', amount: 40 }, invs), 40);
  assert.equal(effectiveDiscountAmount({ id: 'i1', doc_type: 'IND', invoice_id: null, amount: 105 }, invs), 105);
  assert.equal(effectiveDiscountAmount({ id: 'i2', amount: '70' as any }, invs), 70);
  // faturası listede yoksa nominal
  assert.equal(effectiveDiscountAmount({ id: 'dz9', doc_type: 'DZ', invoice_id: 'Z', amount: 25 }, invs), 25);
});
test('ekstre: boş DZ etkin tutarla, sıfırsa satır düşer', () => {
  const out = withEffectiveDiscounts([
    { id: 'dz1', doc_type: 'DZ' as const, invoice_id: 'A', amount: 200, x: 1 },
    { id: 'dz2', doc_type: 'DZ' as const, invoice_id: 'A', amount: 150, x: 2 },
    { id: 'i1', doc_type: 'IND' as const, invoice_id: null, amount: 105, x: 3 },
  ], invs);
  assert.deepEqual(out, [
    { id: 'dz2', doc_type: 'DZ', invoice_id: 'A', amount: 100, x: 2 },
    { id: 'i1', doc_type: 'IND', invoice_id: null, amount: 105, x: 3 },
  ]);
});
