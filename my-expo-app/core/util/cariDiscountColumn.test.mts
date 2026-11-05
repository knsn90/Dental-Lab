// node --test core/util/cariDiscountColumn.test.mts
// Ortak cari PDF şablonunun İndirim sütunu parçaları: kapalıyken hiçbir şey üretmez
// (tedarikçi/çalışan ekstresi bit bit aynı kalır), açıkken metni kaçışlı yazar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cariDiscountTh, cariDiscountTd, cariDiscountSummaryRow } from './cariDiscountColumn.ts';

test('show=false → üç parça da boş', () => {
  assert.equal(cariDiscountTh(false, 'İndirim'), '');
  assert.equal(cariDiscountTd(false, '−10,00 TRY'), '');
  assert.equal(cariDiscountTd(false, undefined), '');
  assert.equal(cariDiscountSummaryRow(false, 'İndirimler', '10,00 TRY'), '');
});

test('show=true → başlık hücresi etiketi taşır', () => {
  const th = cariDiscountTh(true, 'İndirim');
  assert.match(th, /^<th[^>]*>/);
  assert.ok(th.includes('İndirim'));
  assert.ok(th.endsWith('</th>'));
});

test('başlık etiketi kaçışlı', () => {
  assert.ok(cariDiscountTh(true, '<i>').includes('&lt;i&gt;'));
});

test('hücre metni HTML kaçışlı', () => {
  const td = cariDiscountTd(true, '<b>');
  assert.ok(td.includes('&lt;b&gt;'));
  assert.ok(!td.includes('<b>'));
});

test('metin yoksa boş hücre', () => {
  assert.match(cariDiscountTd(true, undefined), /^<td[^>]*><\/td>$/);
  assert.match(cariDiscountTd(true, ''), /^<td[^>]*><\/td>$/);
});

test('özet satırı etiketi ve tutar HTML\'ini içerir', () => {
  const row = cariDiscountSummaryRow(true, 'İndirimler', '<span>10,00 TRY</span>');
  assert.ok(row.includes('İndirimler'));
  assert.ok(row.includes('<span>10,00 TRY</span>'));
});
