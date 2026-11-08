// node --test modules/invoices/lib/statementDiscount.test.mts — ekstre indirimi saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementDiscountDocNo, sdErrorText, invoiceStatusErrorText, discountPeriodLabel, sdServerError, invoiceDiscountOf, discountCellValue, discountStatementLines, hasAnyDiscount, discountTotal } from './statementDiscount.ts';

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

test('fatura durum hatası: SD kilitleri okunur metne, diğerleri ham', () => {
  assert.equal(invoiceStatusErrorText('check violation: SD_DRAFT_LOCKED'), 'Bu faturaya ekstre indirimi payı uygulanmış; taslağa çevrilemez. Gerekirse indirimi ekstreden silin.');
  assert.equal(invoiceStatusErrorText('SD_UNCANCEL_LOCKED'), 'Bu faturanın ekstre indirimi payı iptalde alacağa döndü; iptal geri alınamaz.');
  assert.equal(invoiceStatusErrorText('Yetkiniz yok'), 'Yetkiniz yok');
  assert.equal(invoiceStatusErrorText(''), 'İşlem başarısız');
  assert.equal(invoiceStatusErrorText(null), 'İşlem başarısız');
});

test('kesinleşmiş fatura kilidi okunur metne çevrilir', () => {
  const t = 'Kesilmiş fatura değiştirilemez ve silinemez. Düzeltme için düzeltme belgesi (DZ), iptal ya da ek fatura kullanın.';
  assert.equal(invoiceStatusErrorText('INV_ISSUED_LOCKED'), t);
  assert.equal(invoiceStatusErrorText('ERROR: INV_ISSUED_LOCKED (SQLSTATE 42501)'), t);
  assert.equal(invoiceStatusErrorText('INV_DISCOUNT_LOCKED'), t);
  assert.equal(invoiceStatusErrorText('INV_OTHER'), 'INV_OTHER');
});

test('DZ satırı indirim sütununa ve toplamına girmez', () => {
  const base = { lab_id: 'l', clinic_id: 'c', currency: 'TRY', discount_date: '2026-11-01', period_from: '2026-11-01', period_to: '2026-11-01', kind: 'fixed' as const, value: 0, base_amount: 0, doc_no: 1, description: null, created_at: '', invoice_id: null, invoice_item_id: null };
  const lines = discountStatementLines([
    { ...base, id: 'a', doc_type: 'IND', amount: 100 },
    { ...base, id: 'b', doc_type: 'DZ', amount: 40 },
  ], 'TRY');
  assert.deepEqual(lines.map(l => l.invoiceNo), ['İND-1', 'DZ-1']);
  assert.deepEqual(lines.map(l => l.docKind), ['IND', 'DZ']);
  assert.equal(discountTotal(lines), 100);
  assert.equal(discountCellValue(lines[1], 'amount'), null);
  assert.equal(hasAnyDiscount([lines[1]]), false);
  assert.equal(hasAnyDiscount(lines), true);
});

test('invoiceStatusErrorText: INV_APPROVAL_REQUIRED okunur metin', () => {
  assert.equal(
    invoiceStatusErrorText('P0001: INV_APPROVAL_REQUIRED'),
    'Bu lab\'da fatura klinik onayıyla kesinleşir; "Klinik adına onay kaydet"i kullanın',
  );
});
