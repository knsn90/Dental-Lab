// node --test modules/invoices/lib/statementDiscount.test.mts — ekstre indirimi saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementDiscountDocNo, sdErrorText, discountPeriodLabel, sdServerError, invoiceDiscountOf, discountCellValue, discountStatementLines, hasAnyDiscount, discountTotal } from './statementDiscount.ts';

test('belge numarası', () => { assert.equal(statementDiscountDocNo(7), 'İND-7'); });
test('hata metinleri spec §10', () => {
  assert.equal(sdErrorText('SD_VALUE'), "İndirim 0'dan büyük olmalı.");
  assert.equal(sdErrorText('SD_CAP'), 'Bu döneme verilen indirimlerin toplamı dönemin fatura toplamını aşamaz.');
  assert.equal(sdErrorText('SD_EMPTY'), 'Bu dönemde kesilmiş fatura yok.');
  assert.equal(sdErrorText('XYZ'), 'İndirim kaydedilemedi.');
  assert.equal(sdErrorText(null), 'İndirim kaydedilemedi.');
});
test('dönem etiketi: tam tek ay → "Ay Yıl", aksi halde gün aralığı', () => {
  const m = (i: number) => ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][i];
  assert.equal(discountPeriodLabel('2026-10-01', '2026-10-31', m), 'Ekim 2026');
  assert.equal(discountPeriodLabel('2026-02-01', '2026-02-28', m), 'Şubat 2026');
  assert.equal(discountPeriodLabel('2026-10-01', '2026-12-31', m), '01.10.2026 – 31.12.2026');
  assert.equal(discountPeriodLabel('2026-10-05', '2026-10-31', m), '05.10.2026 – 31.10.2026');
});

test('sunucu mesajından SD_* kodu ya da ham mesaj', () => {
  assert.equal(sdServerError('SD_CAP'), 'SD_CAP');
  assert.equal(sdServerError('check violation: SD_UNCANCEL_LOCKED (ctx)'), 'SD_UNCANCEL_LOCKED');
  assert.equal(sdServerError('Yetkiniz yok'), 'Yetkiniz yok');
  assert.equal(sdServerError(''), null);
  assert.equal(sdServerError(null), null);
});

test('fatura indirimi: kalem + fatura altı', () => {
  assert.deepEqual(invoiceDiscountOf({ items: [{ total: 100, net_total: 90 }, { total: '50', net_total: '50' }], discount_amount: 14 }), { amount: 24, gross: 150 });
  assert.deepEqual(invoiceDiscountOf({ items: null }), { amount: 0, gross: 0 });
});
test('sütun değeri: tutar/yüzde, bir ondalık', () => {
  const l = { type: 'discount', discount: 35, discountBase: 350 };
  assert.deepEqual(discountCellValue(l, 'amount'), { kind: 'amount', value: 35 });
  assert.deepEqual(discountCellValue(l, 'percent'), { kind: 'percent', value: 10 });
  assert.deepEqual(discountCellValue({ type: 'invoice', discount: 1, discountBase: 3 }, 'percent'), { kind: 'percent', value: 33.3 });
  assert.equal(discountCellValue({ type: 'invoice', discount: 0, discountBase: 100 }, 'amount'), null);
  assert.equal(discountCellValue({ type: 'invoice', discount: 5, discountBase: 0 }, 'percent'), null);
});
test('indirim satırları yalnız seçili para biriminde', () => {
  const d = (id: string, currency: string) => ({ id, currency, discount_date: '2026-10-31', amount: 10, base_amount: 100, doc_no: 3, description: 'x' }) as any;
  const out = discountStatementLines([d('a', 'TRY'), d('b', 'EUR')], 'TRY');
  assert.deepEqual(out.map(l => [l.id, l.type, l.debit, l.credit, l.discount]), [['disc-a', 'discount', 0, 0, 10]]);
  assert.equal(out[0].invoiceNo, 'İND-3');
});
test('hasAnyDiscount / discountTotal', () => {
  const ls = [{ type: 'invoice', discount: 5 }, { type: 'discount', discount: 9 }, { type: 'discount', discount: 1 }];
  assert.equal(hasAnyDiscount(ls), true);
  assert.equal(hasAnyDiscount([{ discount: 0 }, {}]), false);
  assert.equal(discountTotal(ls), 10);
});
