// node --test modules/clinics/clinicPriceMap.test.mts
// Yeni sipariş ekranının klinik fiyat haritası: resolve_item_price (20261105120000) ile aynı öncelik ve kuruş.
// Sıra: özel fiyat → özel yüzde (> 0) → kliniğin genel oranı (> 0) → katalog. Yüzde = ROUND(katalog × (100 − p) / 100, 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClinicRate, buildClinicPriceMap, clinicListFields, sameClinicPriceMap } from './clinicDiscount.ts';
import { listPriceInfo } from '../invoices/lib/invoiceDiscount.ts';

const SERVICES = [
  { id: 'plain', price: 1000 },
  { id: 'own-price', price: 1000 },
  { id: 'own-pct', price: 1000 },
  { id: 'zero-pct', price: 250 },
];
const OVERRIDES = [
  { service_id: 'own-price', custom_price: 700, discount_percent: null, currency: 'USD' },
  { service_id: 'own-pct', custom_price: null, discount_percent: 20, currency: null },
  { service_id: 'zero-pct', custom_price: null, discount_percent: 0, currency: null },
];

test('genel oran %10: özel fiyatı/yüzdesi olmayan hizmet %10 eksik, liste fiyatı ve oran taşınır', () => {
  const map = buildClinicPriceMap(SERVICES, OVERRIDES, 10);
  assert.deepEqual(map.plain, { price: 900, listPrice: 1000, ratePct: 10 });
});

test('özel fiyat genel orandan önce gelir, para birimiyle aynen kalır', () => {
  const map = buildClinicPriceMap(SERVICES, OVERRIDES, 10);
  assert.deepEqual(map['own-price'], { price: 700, currency: 'USD' });
});

test('özel yüzde genel orandan önce gelir, gösterim alanı taşımaz', () => {
  const map = buildClinicPriceMap(SERVICES, OVERRIDES, 10);
  assert.deepEqual(map['own-pct'], { price: 800 });
});

test('yüzdesi 0 olan özel satır veritabanındaki gibi genel orana düşer', () => {
  const map = buildClinicPriceMap(SERVICES, OVERRIDES, 10);
  assert.deepEqual(map['zero-pct'], { price: 225, listPrice: 250, ratePct: 10 });
});

test('özel yüzde SQL ROUND ile aynı yuvarlanır (eski Math.round 34,42 veriyordu)', () => {
  const map = buildClinicPriceMap(
    [{ id: 'a', price: 40.5 }, { id: 'b', price: 1.5 }],
    [
      { service_id: 'a', custom_price: null, discount_percent: 15 },
      { service_id: 'b', custom_price: null, discount_percent: '15' },
    ],
    null,
  );
  assert.equal(map.a.price, 34.43); // 40,5 × 0,85 = 34,425 → 34,43
  assert.equal(map.b.price, 1.28);  // 1,5 × 0,85 = 1,275 → 1,28
});

test('genel oran yarım kuruşu sıfırdan uzağa yuvarlar, numeric metin de okunur', () => {
  const map = buildClinicPriceMap([{ id: 'x', price: '40.5' }, { id: 'y', price: 333.33 }], [], '15');
  assert.deepEqual(map.x, { price: 34.43, listPrice: 40.5, ratePct: 15 });
  assert.equal(buildClinicPriceMap([{ id: 'y', price: 333.33 }], [], 7.5).y.price, 308.33);
});

test('oran yoksa (null, 0, "0") harita yalnız özel satırlardan oluşur (eski davranış)', () => {
  for (const rate of [null, undefined, 0, '0', -5, 'abc']) {
    const map = buildClinicPriceMap(SERVICES, OVERRIDES, rate);
    assert.deepEqual(map, {
      'own-price': { price: 700, currency: 'USD' },
      'own-pct': { price: 800 },
    }, String(rate));
  }
});

test('katalogda olmayan hizmetin özel yüzdesi katalog 0 kabul edilir (eski davranış)', () => {
  const map = buildClinicPriceMap([], [{ service_id: 'gone', custom_price: null, discount_percent: 10 }], 10);
  assert.deepEqual(map, { gone: { price: 0 } });
});

test('harita karşılaştırması gösterim alanlarını da kapsar', () => {
  const a = buildClinicPriceMap(SERVICES, OVERRIDES, 10);
  assert.equal(sameClinicPriceMap(a, buildClinicPriceMap(SERVICES, OVERRIDES, 10)), true);
  const b = { ...a, plain: { ...a.plain, ratePct: 11 } };
  assert.equal(sameClinicPriceMap(a, b), false);
  const c = { ...a, plain: { price: 900 } };
  assert.equal(sameClinicPriceMap(a, c), false);
  assert.equal(sameClinicPriceMap(a, buildClinicPriceMap(SERVICES, OVERRIDES, null)), false);
  assert.equal(sameClinicPriceMap({}, {}), true);
});

test('kalem gösterim alanları yalnız ikisi birden varsa gönderilir', () => {
  assert.deepEqual(clinicListFields(1000, 10), { list_price: 1000, discount_percent: 10 });
  assert.deepEqual(clinicListFields('1000.50', '7.5'), { list_price: 1000.5, discount_percent: 7.5 });
  assert.deepEqual(clinicListFields(undefined, undefined), {});
  assert.deepEqual(clinicListFields(null, 10), {});
  assert.deepEqual(clinicListFields(1000, null), {});
  assert.deepEqual(clinicListFields('abc', 10), {});
  assert.equal(Object.keys(clinicListFields(undefined, 10)).length, 0);
});

// ── İstemci ↔ veritabanı paritesi ────────────────────────────────────────────
// resolve_item_price'ın (20261105120000) dal sırasının JS dökümü + bağımsız sabit noktalı ROUND(x, 2)
// (1e6 ölçekli BigInt; yarım sıfırdan uzağa, Postgres numeric gibi). Haritanın her girdisi bununla aynı olmalı.
function sqlRound2PctOff(catalog: number, pct: number): number {
  const S = BigInt(1_000_000);
  const c = BigInt(Math.round(catalog * 1_000_000));
  const p = BigInt(Math.round(pct * 1_000_000));
  const n = c * (BigInt(100) * S - p);          // catalog × (100 − pct) × 1e12
  const den = S * S;                             // → cents = n / 1e12
  const abs = n < BigInt(0) ? -n : n;
  let q = abs / den; if (BigInt(2) * (abs % den) >= den) q += BigInt(1);
  return Number(n < BigInt(0) ? -q : q) / 100;
}
type Ov = { custom_price: number | null; discount_percent: number | null } | undefined;
function dbResolve(catalog: number, ov: Ov, rate: number | null) {
  if (ov && ov.custom_price != null) return { price: ov.custom_price, list_price: null, discount_percent: null };
  if (ov && ov.discount_percent != null && ov.discount_percent > 0)
    return { price: sqlRound2PctOff(catalog, ov.discount_percent), list_price: null, discount_percent: null };
  if (rate != null && rate > 0) return { price: sqlRound2PctOff(catalog, rate), list_price: catalog, discount_percent: rate };
  return { price: catalog, list_price: null, discount_percent: null }; // kampanya fikstürde yok
}

test('her katalog × oran × özel satır bileşiminde harita = resolve_item_price (fiyat ve gösterim alanları)', () => {
  const catalogs = [0, 1.5, 9.5, 19.99, 40.5, 100, 333.33, 1000, 1250.5, 2999.99];
  const rates = [null, 0, 5, 7.5, 10, 12.5, 15, 33.33, 100];
  const ovs: Ov[] = [undefined, { custom_price: 700, discount_percent: null }, { custom_price: null, discount_percent: 15 },
    { custom_price: null, discount_percent: 0 }, { custom_price: null, discount_percent: null }, { custom_price: 0, discount_percent: 20 }];
  let checked = 0;
  for (const catalog of catalogs) for (const rate of rates) for (const ov of ovs) {
    const map = buildClinicPriceMap([{ id: 's', price: catalog }], ov ? [{ service_id: 's', ...ov }] : [], rate);
    const db = dbResolve(catalog, ov, rate);
    const e = map.s;
    const client = e
      ? { price: e.price, ...clinicListFields(e.listPrice, e.ratePct) }
      : { price: catalog };
    const label = `katalog ${catalog}, oran ${rate}, özel ${JSON.stringify(ov)}`;
    assert.equal(client.price, db.price, label);
    assert.equal((client as any).list_price ?? null, db.list_price, label);
    assert.equal((client as any).discount_percent ?? null, db.discount_percent, label);
    checked++;
  }
  assert.equal(checked, catalogs.length * rates.length * ovs.length);
});

// Görev 17: faturadaki gösterim kontrolü (listPriceInfo, kendi round2'si) applyClinicRate (BigInt) ile aynı kuruşu bulur.
test('listPriceInfo ↔ applyClinicRate: her katalog × oranda tutan fiyat tanınır, 1 kuruş sapan tanınmaz', () => {
  const catalogs = [1.5, 9.5, 19.99, 40.5, 100, 100.1, 333.33, 1000, 1250.5, 2999.99, 1.05, 99.99];
  const rates = [5, 7.5, 10, 12.5, 15, 33.33, 50, 100];
  let checked = 0;
  for (const c of catalogs) for (const r of rates) {
    const net = applyClinicRate(c, r);
    const label = `katalog ${c}, oran ${r}, net ${net}`;
    assert.deepEqual(listPriceInfo({ quantity: 1, unit_price: net, list_unit_price: c, list_discount_pct: r }), { listUnit: c, pct: r }, label);
    for (const off of [-0.01, 0.01]) {
      assert.equal(listPriceInfo({ quantity: 1, unit_price: Math.round((net + off) * 100) / 100, list_unit_price: c, list_discount_pct: r }), null, `${label} ${off}`);
    }
    checked++;
  }
  assert.equal(checked, catalogs.length * rates.length);
});
