// node --test modules/invoices/lib/statementDiscount.test.mts — ekstre indirimi saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementDiscountDocNo, sdErrorText, discountPeriodLabel, sdServerError } from './statementDiscount.ts';

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
