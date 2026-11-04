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

// Değerlendirmeler ekranı: hero, klinik tablosu, boş/hata durumları.
const DASHBOARD_LABELS = [
  'Ortalama', 'Değerlendirme', 'Düşük puan', 'Puan alma', 'Klinikler', 'En çok düşen en üstte',
  'Bu ay puan yok', 'yeni', 'Henüz değerlendirme yok',
  "WhatsApp puan isteğini Ayarlar > Entegrasyonlar'dan açabilirsiniz.", 'Ayarlara git',
  'Bu ayın teslimlerinin 14 günü henüz dolmadı', 'Geçen aya göre', 'Yeniden dene',
  'Değerlendirmeler', 'değerlendirme', 'işe puan verildi', 'düştü', 'yükseldi', 'değişmedi',
  'önceki', 'Son 6 ay', 'Son 6 ayda puan yok', 'Süzgeci kaldır', 'Değerlendirmeler yüklenemedi',
  "WhatsApp'tan", 'Sorunsuz', 'Küçük düzeltme', 'Sorun var',
  'Uyum', 'Kontakt', 'Yüzey', 'Zamanında teslim',
];

test('Değerlendirmeler ekranı hero ve tablo etiketleri en/de/fa sözlüklerinde', () => {
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    for (const k of DASHBOARD_LABELS) assert.ok(typeof d[k] === 'string' && d[k].length > 0, `${lang}: ${k}`);
  }
});

// Düşük puanlar listesi, arama penceresi (spec §9) ve Sağlık Kurumları sekmesi.
const LOW_LIST_LABELS = [
  'Düşük puanlar', 'Genel puan ya da herhangi bir alt puan 3 ve altı', 'Aranmadı', 'Tümü',
  'Kliniği ara', 'Arandı', 'Siparişe git', 'Notu düzenle', 'Önceki arama', 'gündür aranmadı',
  'Telefon kayıtlı değil', 'Arandı olarak işaretle', 'Görüşme notu',
  'İsteğe bağlı. Yalnız lab yöneticileri görür, klinik görmez.', 'Vazgeç', 'Kaydet', 'İşareti kaldır',
  'Değerlendirmeler', 'Bu ay düşük puan yok', 'Aranmamış düşük puan yok', 'Kopyala', 'Kopyalandı',
  'Kaydedilemedi', 'Not', 'Ne konuşuldu, ne karar verildi…',
];

test('düşük puan listesi ve arama penceresi etiketleri en/de/fa sözlüklerinde', () => {
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    for (const k of LOW_LIST_LABELS) assert.ok(typeof d[k] === 'string' && d[k].length > 0, `${lang}: ${k}`);
  }
});

// "Kliniği ara" burada ve triyaj ekranında telefonla aramadır; "Search clinic" yanlış çeviriydi.
test('Kliniği ara telefonla arama olarak çevrilir', () => {
  assert.equal(dict('en')['Kliniği ara'], 'Call clinic');
  assert.equal(dict('de')['Kliniği ara'], 'Klinik anrufen');
});

test('hero fark cümlesi "Geçen aya göre:" diye ayrılır (en/de/fa söz dizimi)', () => {
  assert.equal(dict('en')['Geçen aya göre'], 'Compared with last month:');
  assert.equal(dict('de')['Geçen aya göre'], 'Im Vergleich zum Vormonat:');
  assert.equal(dict('fa')['Geçen aya göre'], 'نسبت به ماه قبل:');
});
