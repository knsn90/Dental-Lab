// node --test modules/clinics/clinicsNavI18n.test.mts
// Sağlık Kurumları menüsünün bütün metinleri üç otomatik sözlükte (tr kaynak; en/de/fa birlikte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clinicsNavGroups, clinicsMobilePills, CLINIC_TYPE_KEYS } from './clinicsNav.ts';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));

// Menü kurallarından gelen başlık, etiket ve açıklamalar.
const groups = clinicsNavGroups({ canSeeReviews: true });
const FROM_RULES = new Set<string>([
  ...groups.map((g) => g.title),
  ...groups.flatMap((g) => g.items.flatMap((i) => [i.label, i.hint])),
  ...clinicsMobilePills({ canSeeReviews: true, activeKey: 'all' }).map((p) => p.label),
  ...CLINIC_TYPE_KEYS.map((k) => clinicsMobilePills({ canSeeReviews: true, activeKey: k })[0].label),
]);

// ClinicsNav.tsx bileşeninde autoT ile çözülen sabit metinler.
const FROM_COMPONENT = [
  'Hızlı İşlemler', 'bekliyor', 'aranmadı',
  'Yeni kurum', 'Yeni klinik ya da sağlık kurumu ekle',
  'Hekim ekle', 'Bir kuruma yeni hekim kaydet',
  'İş emri formu yazdır', 'Kurum adı ve hekimleri önceden yazılı boş form',
  'Bağlantı davet kodu', 'Tek kullanımlık kod üret; klinik girince laboratuvarına bağlanır',
  'Tüm menü', 'Kurum türleri, kişiler, takip ve işlemler', 'Sağlık Kurumları', 'Kapat', 'Menüyü kapat',
];

test('Sağlık Kurumları menü metinleri en/de/fa sözlüklerinde', () => {
  const keys = [...FROM_RULES, ...FROM_COMPONENT];
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    const missing = keys.filter((k) => !(typeof d[k] === 'string' && d[k].length > 0));
    assert.deepEqual(missing, [], `${lang} eksik`);
  }
});

test('üç sözlük aynı anahtar kümesini taşır', () => {
  const [en, de, fa] = ['en', 'de', 'fa'].map((l) => Object.keys(dict(l)).sort());
  assert.deepEqual(de, en);
  assert.deepEqual(fa, en);
});
