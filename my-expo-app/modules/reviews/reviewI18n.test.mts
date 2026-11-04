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

// Düşük puan bildirimleri: Ayarlar satırları + veritabanından gelen bildirim başlıkları.
const LOW_ALERT_LABELS = [
  'Düşük puan', 'Genel ya da alt puan 3 ve altı',
  'Düşük puan aranmadı', '2 gün aranmayan düşük puan için bir kez',
  'Düşük puan 2 gündür aranmadı', 'Hekim sorun bildirdi',
];

test('düşük puan bildirim etiketleri ve başlıkları en/de/fa sözlüklerinde', () => {
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    for (const k of LOW_ALERT_LABELS) assert.ok(typeof d[k] === 'string' && d[k].length > 0, `${lang}: ${k}`);
  }
});
