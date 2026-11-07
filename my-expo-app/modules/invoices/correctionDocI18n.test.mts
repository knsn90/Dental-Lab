// node --test modules/invoices/correctionDocI18n.test.mts
// Düzeltme belgesi (DZ) arayüzü metinleri üç otomatik sözlükte boş olmayan değerle var
// (tr kaynak; en/de/fa birlikte — CLAUDE.md çok dillilik kuralı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dzErrorText } from './lib/correctionDoc.ts';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));

// dzErrorText: altı kod + bilinmeyen kod → genel metin
const ERRORS = ['DZ_VALUE', 'DZ_CAP', 'DZ_REASON', 'DZ_STATUS', 'DZ_DELETE_LOCKED', 'DZ_IDEMPOTENCY_CONFLICT', 'BILINMEYEN']
  .map(dzErrorText);

// Fatura detayı (kalem düğmesi, kalem altı DZ listesi, tahsilat etiketi), pencere, ekstre ve PDF
const UI = [
  'Düzeltme', 'Düzeltme belgesi', 'Bu kalem için düzeltme belgesi (DZ) yaz',
  'Tutar', 'Gerekçe', 'Örn. Model ücretsiz olmalıydı', 'Belge tarihi',
  'Kalan tutar', 'Bu faturaya', 'Alacağa',
  'Bu faturanın e-faturası gönderilmiş. E-fatura tarafını (iade/fiyat farkı) muhasebecinizle düzenleyin; DZ yalnız Siman içi belgedir.',
  'Kaydet', 'Vazgeç', 'Kapat', 'Pencereyi kaydetmeden kapat',
  'Düzeltme belgesini kaydet; tutar bu faturadan düşer, artan kısım kliniğin alacağına geçer',
  'Düzeltme belgesi kaydedildi',
];

test('düzeltme belgesi metinleri en/de/fa sözlüklerinde', () => {
  const keys = [...new Set([...ERRORS, ...UI])];
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    const missing = keys.filter((k) => !(typeof d[k] === 'string' && d[k].trim().length > 0));
    assert.deepEqual(missing, [], `${lang} eksik`);
  }
});

test('üç sözlük aynı anahtar kümesini taşır', () => {
  const [en, de, fa] = ['en', 'de', 'fa'].map((l) => Object.keys(dict(l)).sort());
  assert.deepEqual(de, en);
  assert.deepEqual(fa, en);
});
