// node --test modules/clinics/clinicsNav.test.mts
// Sağlık Kurumları sol menüsü — saf kurallar (kullanıcı onayı 2026-11-04: sekmeler sol menüye).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clinicsNavGroups, clinicsMobilePills, resolveClinicsTab, clinicsSection, CLINIC_TYPE_KEYS } from './clinicsNav.ts';

const keys = (g: { items: { key: string }[] }) => g.items.map(i => i.key);

test('menü üç bölüm başlığı: Kurumlar, Kişiler, Takip', () => {
  const groups = clinicsNavGroups({ canSeeReviews: true });
  assert.deepEqual(groups.map(g => g.title), ['Kurumlar', 'Kişiler', 'Takip']);
  assert.deepEqual(keys(groups[0]), ['all', 'muayenehane', 'klinik', 'poliklinik', 'hastane', 'laboratuvar']);
  assert.deepEqual(keys(groups[1]), ['doctors', 'managers']);
  assert.deepEqual(keys(groups[2]), ['connections', 'reviews']);
});

test('Değerlendirmeler yetkisi yoksa Takip yalnız Bağlantılar', () => {
  const groups = clinicsNavGroups({ canSeeReviews: false });
  assert.deepEqual(keys(groups[2]), ['connections']);
});

test('tür anahtarları kurum kategorileriyle aynı sırada', () => {
  assert.deepEqual([...CLINIC_TYPE_KEYS], ['muayenehane', 'klinik', 'poliklinik', 'hastane', 'laboratuvar']);
});

test('mobil: Kurumlar · Hekimler · Puanlar, ilki seçili', () => {
  const p = clinicsMobilePills({ canSeeReviews: true, activeKey: 'all' });
  assert.deepEqual(p.map(x => x.key), ['all', 'doctors', 'reviews']);
  assert.deepEqual(p.map(x => x.label), ['Kurumlar', 'Hekimler', 'Puanlar']);
  assert.deepEqual(p.map(x => x.active), [true, false, false]);
});

test('mobil: yetki yoksa üçüncü sekme Bağlantılar', () => {
  const p = clinicsMobilePills({ canSeeReviews: false, activeKey: 'all' });
  assert.deepEqual(p.map(x => x.key), ['all', 'doctors', 'connections']);
});

test('mobil: tür seçiliyken ilk sekme o türü gösterir (dördüncü sekme açılmaz)', () => {
  const p = clinicsMobilePills({ canSeeReviews: true, activeKey: 'klinik' });
  assert.deepEqual(p.map(x => x.key), ['klinik', 'doctors', 'reviews']);
  assert.equal(p[0].label, 'Klinik');
  assert.equal(p[0].active, true);
});

test('mobil: her sekme bir grup; Yöneticiler seçiliyken ikinci sekme Yöneticiler olur', () => {
  const p = clinicsMobilePills({ canSeeReviews: true, activeKey: 'managers' });
  assert.deepEqual(p.map(x => x.key), ['all', 'managers', 'reviews']);
  assert.deepEqual(p.map(x => x.active), [false, true, false]);
});

test('mobil: Bağlantılar seçiliyken üçüncü sekme Bağlantılar olur', () => {
  const p = clinicsMobilePills({ canSeeReviews: true, activeKey: 'connections' });
  assert.deepEqual(p.map(x => x.key), ['all', 'doctors', 'connections']);
  assert.equal(p[2].active, true);
});

test('mobil: hangi bölüm seçili olursa olsun tam üç sekme, biri seçili', () => {
  for (const canSeeReviews of [true, false]) {
    for (const g of clinicsNavGroups({ canSeeReviews })) {
      for (const it of g.items) {
        const p = clinicsMobilePills({ canSeeReviews, activeKey: it.key });
        assert.equal(p.length, 3, it.key);
        assert.equal(p.filter(x => x.active).length, 1, it.key);
      }
    }
  }
});

test('?tab= yalnız geçerli ve yetkili bölümü açar', () => {
  assert.equal(resolveClinicsTab('reviews', { canSeeReviews: true }), 'reviews');
  assert.equal(resolveClinicsTab('reviews', { canSeeReviews: false }), null);
  assert.equal(resolveClinicsTab('connections', { canSeeReviews: false }), 'connections');
  assert.equal(resolveClinicsTab('klinik', { canSeeReviews: false }), 'klinik');
  assert.equal(resolveClinicsTab('bilinmeyen', { canSeeReviews: true }), null);
  assert.equal(resolveClinicsTab(undefined, { canSeeReviews: true }), null);
});

test('bölüm başlığı ve açıklaması: türler ortak açıklamayı kullanır', () => {
  assert.deepEqual(clinicsSection('all'), { key: 'all', label: 'Tüm kurumlar', hint: 'Laboratuvara bağlı sağlık kurumları' });
  assert.equal(clinicsSection('hastane').label, 'Hastane');
  assert.equal(clinicsSection('hastane').hint, 'Bu türdeki sağlık kurumları');
  assert.equal(clinicsSection('reviews').label, 'Değerlendirmeler');
  assert.equal(clinicsSection('yok'), null);
});
