// node --test modules/invoices/statementDiscountI18n.test.mts
// Ekstre indirimi metinleri (Görev 1/4/5/7) üç otomatik sözlükte boş olmayan değerle var
// (tr kaynak; en/de/fa birlikte — CLAUDE.md çok dillilik kuralı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sdErrorText, invoiceStatusErrorText } from './lib/statementDiscount.ts';
import { validateInvoiceDiscount } from './lib/invoiceDiscount.ts';

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

// Görev 11: fatura altı indirim alanı, toplu fatura akışları, alan/RPC hata metinleri
const TASK11 = [
  'Fatura indirimi', 'Faturala', 'Tahmini indirimli toplam', 'Toplu fatura',
  'KDV öncesi; tarama ücretleri ve acil farkı faturada eklenir.', 'Fatura tutarı 0 olacak.',
  'Faturalanmamış siparişleri tek taslak faturada birleştir', 'Yetkiniz yok',
  ...['abc', '101', '5'].map((raw, i) => {
    const r = validateInvoiceDiscount((['fixed', 'percent', null] as const)[i], raw);
    return r.ok ? '' : r.error;
  }),
];

// Görev 12: fatura detayı ve PDF
const TASK12 = [
  'Kalem toplamı', 'Fatura indirimi', 'Fatura indirimi kaydedildi', 'Fatura tutarı 0 olacak.', 'Kaydet',
  'Kesilmiş faturada indirim değiştirilemez. Ekstreden indirim ekleyebilirsiniz.',
];

// Düzeltme turu (Görev 13): e-fatura sunucu hata metni (sunucudan Türkçe gelir, istemci autoT ile çevirir)
const TASK13 = [
  'Fatura indirimi KDV yuvarlaması nedeniyle e-fatura kalemlerine kuruşu kuruşuna dağıtılamadı. Faturayı iptal edip indirimi farklı bir tutarla yeniden kesin ya da indirimi ekstreden uygulayın.',
  'Farklı KDV oranlı kalemleri olan indirimli fatura e-faturaya gönderilemiyor.',
];

// Görev 16: klinik indirim penceresi cümlesi ve fiyat listesindeki genel oran işareti ("%X" ayrı string çocuğu)
const TASK16 = [
  'Bu oran, kliniğe özel fiyatı olmayan hizmetlerde yeni siparişlere uygulanır.',
  'Genel indirim',
];

// Görev 17: fatura detayı ve PDF'te genel orandan gelen kalemin ikincil satırı ("Liste fiyatı X · Genel indirim %Y")
const TASK17 = ['Liste fiyatı', 'Genel indirim'];

// Son inceleme: SD kilidi hata metinleri (taslağa dönüş / iptal geri alma)
const FINAL = ['SD_DRAFT_LOCKED', 'SD_UNCANCEL_LOCKED', ''].map(invoiceStatusErrorText);

test('ekstre indirimi metinleri en/de/fa sözlüklerinde', () => {
  const keys = [...new Set([...TASK1, ...TASK4_5, ...TASK7, ...TASK11, ...TASK12, ...TASK13, ...TASK16, ...TASK17, ...FINAL])];
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

test('klinik penceresinin eski cümlesi (yalnız orada kullanılıyordu) sözlüklerden kalktı', () => {
  for (const lang of ['en', 'de', 'fa']) {
    assert.equal(dict(lang)['Bu oran yeni fatura oluştururken otomatik uygulanır.'], undefined, lang);
  }
});
