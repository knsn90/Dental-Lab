// node --test supabase/functions/send-whatsapp-meta/reviewLowTemplates.test.ts
// Düşük puan lab şablonlarının değişkenleri (spec 2026-11-04 §14; Meta'daki adlarla birebir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_LOW_TEMPLATE_NAMES, reviewLowLabParams } from './reviewLowTemplates.ts';

const P = { orderNumber: '2481', clinic: 'K', doctor: 'H', workType: 'Zirkonya', scores: 'Genel 3' };

test('şablon adları', () => {
  assert.deepEqual(REVIEW_LOW_TEMPLATE_NAMES, { review_low: 'dusuk_puan_lab', review_low_reminder: 'dusuk_puan_hatirlatma' });
});

test('düşük puan uyarısı değişkenleri', () => {
  assert.deepEqual(reviewLowLabParams('review_low', P), [
    { name: 'siparis_no', text: '2481' },
    { name: 'is_turu', text: 'Zirkonya' },
    { name: 'hekim', text: 'H' },
    { name: 'klinik', text: 'K' },
    { name: 'puanlar', text: 'Genel 3' },
  ]);
});

test('hatırlatma değişkenleri', () => {
  assert.deepEqual(reviewLowLabParams('review_low_reminder', P), [
    { name: 'siparis_no', text: '2481' },
    { name: 'klinik', text: 'K' },
  ]);
});

test('eksik alan —', () => {
  assert.deepEqual(reviewLowLabParams('review_low', {}).map((x) => x.text), ['—', '—', '—', '—', '—']);
  assert.deepEqual(reviewLowLabParams('review_low_reminder', { orderNumber: '  ' }).map((x) => x.text), ['—', '—']);
});
