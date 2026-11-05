// node --test modules/invoices/statementDiscountI18n.test.mts
// Ekstre indirimi metinleri (Görev 1/4/5/7) üç otomatik sözlükte boş olmayan değerle var
// (tr kaynak; en/de/fa birlikte — CLAUDE.md çok dillilik kuralı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sdErrorText } from './lib/statementDiscount.ts';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));

// Görev 1: hata metinleri (sdErrorText eşlemesinden; bilinmeyen kod → genel metin)
const TASK1 = ['SD_VALUE', 'SD_CAP', 'SD_EMPTY', 'BILINMEYEN'].map(sdErrorText);
// Görev 4: karlılık satırı · Görev 5: ödeme yöntemi etiketi
const TASK4_5 = ['Ekstre indirimleri', 'Ekstre indirimi'];
// Görev 7: ekstre ekranı, İndirim ekle penceresi, liste ayarı, PDF/Excel
const TASK7 = [
  'İndirim ekle', 'Seçili dönemin faturalarına yüzde ya da tutar indirim uygula',
  'Dönem', 'İndirim türü', 'Yüzde', 'Tutar', 'Hesaplanan indirim', 'Tarih', 'Açıklama',
  'Dönemin fatura toplamı', 'Bu döneme önceki indirimler', 'Faturalara dağıtılacak',
  'Alacağa kalacak', 'Yeni bakiye', 'İndirimi kaydet',
  'İndirimi kaydet; dönemin faturalarına dağıtılır, kalan kısım alacağa geçer',
  'İndirim kaydedildi', 'Dönem indirimi', 'İndirim', 'İNDİRİM',
  'Faturadaki indirim tutara zaten yansımıştır; bakiyeden ayrıca düşülmez. Ekstre indirimleri kendi satırında bakiyeyi düşürür.',
  'İndirimler', 'İndirim gösterimi', 'İndirim sütununda tutar ya da yüzde yazar',
  'İndirimi sil',
  'Bu indirim silinsin mi? Kliniğin bakiyesi indirim kadar artar ve faturalardaki indirim payları geri alınır.',
  'İndirim silinemedi.', 'İndirim silindi',
];

test('ekstre indirimi metinleri en/de/fa sözlüklerinde', () => {
  const keys = [...new Set([...TASK1, ...TASK4_5, ...TASK7])];
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
