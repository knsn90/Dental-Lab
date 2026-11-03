// node --test modules/reviews/reviewI18n.test.mts
// Bekleyen değerlendirme kartının etiketleri (mobil + masaüstü pano) üç otomatik sözlükte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));

const PENDING_CARD_LABELS = ['Değerlendir', 'Değerlendirilecek', 'iş değerlendirilmeyi bekliyor'];

test('bekleyen değerlendirme kartı etiketleri en/de/fa sözlüklerinde', () => {
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    for (const k of PENDING_CARD_LABELS) assert.ok(typeof d[k] === 'string' && d[k].length > 0, `${lang}: ${k}`);
  }
});
