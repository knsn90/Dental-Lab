// node --test my-expo-app/modules/efatura/lib/linkMatch.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLucaInvoice, amountsMatch } from './linkMatch.ts';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, clinic_id: 'luna', clinic_vkn: '6091290810', currency: 'EUR', issue_date: '2026-09-01', total: 10, ...over,
});
const luca = { buyerVkn: '6091290810', currency: 'EUR', date: '2026-10-20', payable: 30 };

test('alıcı VKN → klinik; aynı döviz ve Luca tarihine kadarki faturalar seçilir', () => {
  const rows = [
    row('a', { issue_date: '2026-06-19' }), row('b', { issue_date: '2026-10-20' }),
    row('c', { issue_date: '2026-10-21' }),                       // Luca faturasından sonra → seçilmez
    row('d', { currency: 'TRY' }),                                // başka döviz
    row('x', { clinic_id: 'other', clinic_vkn: '1111111111' }),
  ];
  assert.deepEqual(matchLucaInvoice(rows, luca), { ok: true, clinicId: 'luna', currency: 'EUR', ids: ['a', 'b'] });
});

test('VKN boşluklu yazılmış olsa da eşleşir', () => {
  assert.equal(matchLucaInvoice([row('a', { clinic_vkn: '609 129 0810' })], luca).ok, true);
});

test('eşleşmeyen alıcı / döviz anlaşılır hata verir', () => {
  assert.deepEqual(matchLucaInvoice([row('a', { clinic_vkn: '1' })], luca), { ok: false, error: 'Bu faturanın alıcısı Siman\'daki bir klinikle eşleşmedi' });
  assert.deepEqual(matchLucaInvoice([row('a', { currency: 'TRY' })], luca), { ok: false, error: 'Bu klinikte aynı para biriminde e-faturasız fatura yok' });
});

test('tutar karşılaştırması: fatura başına 1 kuruş tolerans', () => {
  assert.equal(amountsMatch(1168.75, 1168.75, 21), true);
  assert.equal(amountsMatch(1168.75, 1168.9, 21), true);
  assert.equal(amountsMatch(1168.75, 1170, 21), false);
  assert.equal(amountsMatch(100, 100.02, 1), false);
});
