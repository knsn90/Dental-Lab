// node --test my-expo-app/modules/purchases/lib/incomingPrefill.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomingToPrefill, matchSupplier, prefillLines, normName } from './incomingPrefill.ts';

const invoice = {
  ettn: '76457015-e2b7-4267-b5c2-62e877991f49', number: 'EFA2026000002699', date: '2026-10-21', dueDate: '2026-11-20',
  currency: 'TRY', crossRate: null, supplier: { name: 'DOKUZ KİMYA ARGE', vkn: '3090341668' }, scenario: 'TICARIFATURA',
  status: 'Onay_Bekliyor', totals: { net: 6791.67, discount: 0, vat: 1358.33, payable: 8150 }, notes: ['(İrsaliye yerine geçer.)'],
  lines: [
    { name: 'REÇİNE SIYIRMA APARATI', quantity: 1, unit: 'adet', unitCode: 'C62', unitPrice: 41.67, netUnitPrice: 41.67, lineNet: 41.67, discount: 0, vatRate: 20, vatAmount: 8.33 },
    { name: 'Model  Pro 3D Yazıcı Reçinesi Gri 1000 g', quantity: 3, unit: 'adet', unitCode: 'C62', unitPrice: 2250, netUnitPrice: 2233.333333, lineNet: 6700, discount: 50, vatRate: 20, vatAmount: 1340 },
  ],
};

test('ad normalleştirme: Türkçe büyük/küçük harf + boşluk duyarsız', () => {
  assert.equal(normName('  Model  PRO 3D yazıcı  REÇİNESİ '), normName('model pro 3d YAZICI reçinesi'));
});

test('başlık: no, tarih, vade, döviz, not, ETTN; KDV tek orandaysa başlığa', () => {
  const p = incomingToPrefill(invoice, null);
  assert.equal(p.ettn, invoice.ettn);
  assert.equal(p.invoiceNumber, 'EFA2026000002699');
  assert.equal(p.invoiceDate, '2026-10-21');
  assert.equal(p.dueDate, '2026-11-20');
  assert.equal(p.currency, 'TRY');
  assert.equal(p.vatRate, 20);
  assert.equal(p.supplierName, 'DOKUZ KİMYA ARGE');
  assert.equal(p.supplierVkn, '3090341668');
  assert.match(p.notes, /e-Fatura EFA2026000002699/);
  assert.equal(p.lines.length, 2);
  // iskontolu satır net birim fiyatla gelir → alış toplamı e-faturayla aynı
  assert.equal(p.lines[1].unitPrice, 2233.333333);
});

test('satırlar: stokta aynı adlı kalem varsa sarf + bağlı; yoksa gözden geçir', () => {
  const p = incomingToPrefill(invoice, null);
  const rows = prefillLines(p, [{ id: 'st-1', name: 'MODEL PRO 3D YAZICI REÇİNESİ GRİ 1000 G', unit: 'şişe' }]);
  assert.deepEqual(rows.map((r) => [r.item_id, r.item_kind ?? null, !!r.needs_review, r.unit]), [
    [null, null, true, 'adet'],
    ['st-1', 'consumable', false, 'şişe'],
  ]);
  assert.equal(rows[1].quantity, '3');
  assert.equal(rows[1].vat_rate, '20');
});

test('tedarikçi: önce VKN, sonra ad; yoksa null', () => {
  const list = [{ id: 's1', name: 'Başka Firma', tax_no: '3090341668' }, { id: 's2', name: 'dokuz kimya arge', tax_no: null }];
  assert.equal(matchSupplier(list, 'DOKUZ KİMYA ARGE', '3090341668')?.id, 's1');
  assert.equal(matchSupplier(list.slice(1), 'DOKUZ KİMYA ARGE', '3090341668')?.id, 's2');
  assert.equal(matchSupplier([], 'X', '1'), null);
});

import { incomingStatus } from './incomingPrefill.ts';

test('Luca durumu → etiket + ton', () => {
  assert.deepEqual(incomingStatus('Onay_Bekliyor'), { label: 'Onay bekliyor', tone: 'warning' });
  assert.deepEqual(incomingStatus('Otomatik_Onaylandi'), { label: 'Onaylandı', tone: 'success' });
  assert.deepEqual(incomingStatus('Onaylandi'), { label: 'Onaylandı', tone: 'success' });
  assert.deepEqual(incomingStatus('Reddedildi'), { label: 'Reddedildi', tone: 'danger' });
  assert.deepEqual(incomingStatus('Iade_Edildi'), { label: 'İade edildi', tone: 'danger' });
  assert.deepEqual(incomingStatus('Garip_Durum'), { label: 'Garip Durum', tone: 'neutral' });
  assert.deepEqual(incomingStatus(null), { label: '—', tone: 'neutral' });
});
