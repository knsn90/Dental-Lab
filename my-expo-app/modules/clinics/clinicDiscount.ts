/**
 * clinicDiscount — Klinikler ekranındaki "Klinik İndirimi" kaydının saf kuralları.
 *
 * `clinic_discounts` tablosunun benzersiz anahtarı (lab_id, clinic_id). Upsert'in
 * onConflict'i bu anahtarla aynı olmalı; yalnız 'clinic_id' Postgres'te 42P10
 * ("ON CONFLICT'e uyan benzersiz kural yok") verir ve kayıt hiç yazılmaz.
 */
export interface ClinicDiscountTarget {
  id: string;
  lab_id?: string | null;
}

export interface ClinicDiscountRow {
  lab_id?: string;
  clinic_id: string;
  discount_rate: number;
}

export function clinicDiscountUpsert(
  clinic: ClinicDiscountTarget,
  percent: number,
): { row: ClinicDiscountRow; onConflict: string } {
  const row: ClinicDiscountRow = {
    // lab_id yoksa gönderme: sütun varsayılanı get_my_lab_id() doldurur, RLS de aynısını ister.
    ...(clinic.lab_id ? { lab_id: clinic.lab_id } : {}),
    clinic_id: clinic.id,
    discount_rate: percent,
  };
  return { row, onConflict: 'lab_id,clinic_id' };
}

/** "7,5" / "10" → sayı; boş, sayı dışı ya da 0–100 dışı → null. */
export function parseDiscountPercent(input: string): number | null {
  const s = String(input ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Sayıyı (String(n) biçimindeki ondalık gösterimiyle) tam sayı + ölçek olarak çözer:
 * değer = digits / 10^scale. Kayan nokta aritmetiği kullanılmaz.
 */
function toDecimal(n: number): { neg: boolean; digits: bigint; scale: number } {
  const neg = n < 0;
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(n)));
  if (!m) return { neg, digits: BigInt(0), scale: 0 };
  const frac = m[2] ?? '';
  const exp = m[3] ? Number(m[3]) : 0;
  let scale = frac.length - exp;
  let digits = BigInt(m[1] + frac);
  if (scale < 0) {
    digits = digits * BigInt('1' + '0'.repeat(-scale));
    scale = 0;
  }
  return { neg, digits, scale };
}

/**
 * Klinik genel oranı: ROUND(catalog × (100 − pct) / 100, 2) ile kuruşu kuruşuna aynı.
 * Yarım kuruş sıfırdan uzağa yuvarlanır (Postgres numeric ROUND). Oran sınırlanmaz (clamp yok);
 * geçersiz (sonlu olmayan) katalog 0, sonlu olmayan oran 0 kabul edilir.
 */
export function applyClinicRate(catalog: number, pct: number): number {
  if (!Number.isFinite(catalog)) return 0;
  const p = Number.isFinite(pct) ? pct : 0;
  const c = toDecimal(catalog);
  const r = toDecimal(p);
  const pow = (k: number) => BigInt('1' + '0'.repeat(k));
  // catalog × (100 − pct) / 100 = C·(100·10^ps − P) / 10^(cs+ps+2); kuruşa çevirmek için 100 ile çarpılır:
  // cents = N / 10^(cs+ps), N = C·(100·10^ps − P)·(±).
  const pSigned = r.neg ? -r.digits : r.digits;
  const cSigned = c.neg ? -c.digits : c.digits;
  const n = cSigned * (BigInt(100) * pow(r.scale) - pSigned);
  const k = c.scale + r.scale;
  const div = pow(k);
  const absN = n < BigInt(0) ? -n : n;
  let q = absN / div;
  const rem = absN % div;
  if (BigInt(2) * rem >= div) q = q + BigInt(1);
  const cents = n < BigInt(0) ? -q : q;
  return Number(cents) / 100;
}

/**
 * Yeni sipariş ekranının klinik fiyat haritası değeri. `listPrice` / `ratePct` yalnız kliniğin genel oranı
 * uygulandığında doludur (gösterim: katalog fiyatı + oran); diğer dallarda yoktur.
 */
export interface ClinicPriceEntry {
  price: number;
  currency?: string | null;
  listPrice?: number;
  ratePct?: number;
}

/** clinic_price_overrides satırının haritaya giren alanları (numeric sütunlar metin de gelebilir). */
export interface ClinicPriceOverrideRow {
  service_id: string;
  custom_price: number | string | null;
  discount_percent: number | string | null;
  currency?: string | null;
}

const positive = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Klinik fiyat haritası, resolve_item_price ile aynı öncelikle:
 *   özel fiyat → özel yüzde (> 0) → kliniğin genel oranı (> 0) → katalog (haritada girdi yok).
 * Kampanya istemci haritasında hiç yoktu, eklenmez (veritabanında da genel oranın altında).
 * Yüzdeler applyClinicRate ile uygulanır: ROUND(katalog × (100 − yüzde) / 100, 2) ile kuruşu kuruşuna aynı.
 * Özel fiyatı da yüzdesi de olmayan (ya da yüzdesi 0 olan) satır veritabanında olduğu gibi genel orana düşer.
 */
export function buildClinicPriceMap(
  services: ReadonlyArray<{ id: string; price: unknown }>,
  overrides: ReadonlyArray<ClinicPriceOverrideRow>,
  clinicRate: unknown,
): Record<string, ClinicPriceEntry> {
  const base: Record<string, number> = {};
  services.forEach(s => { base[s.id] = Number(s.price) || 0; });
  const map: Record<string, ClinicPriceEntry> = {};
  overrides.forEach(ov => {
    if (ov.custom_price != null && ov.custom_price !== '') {
      // Özel FİYAT: para birimi de override'dan gelir (USD listesi gibi).
      map[ov.service_id] = { price: Number(ov.custom_price), currency: ov.currency ?? null };
      return;
    }
    const pct = positive(ov.discount_percent);
    if (pct != null) {
      // İskonto: katalog fiyatının yüzdesi → para birimi KATALOĞUN kalır.
      map[ov.service_id] = { price: applyClinicRate(base[ov.service_id] ?? 0, pct) };
    }
  });
  const rate = positive(clinicRate);
  if (rate != null) {
    services.forEach(s => {
      if (map[s.id]) return;
      const catalog = base[s.id];
      map[s.id] = { price: applyClinicRate(catalog, rate), listPrice: catalog, ratePct: rate };
    });
  }
  return map;
}

/** İki harita aynı mı (fiyat, para birimi ve gösterim alanları dahil). */
export function sameClinicPriceMap(
  a: Record<string, ClinicPriceEntry>,
  b: Record<string, ClinicPriceEntry>,
): boolean {
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k =>
    b[k] != null
    && a[k].price === b[k].price
    && (a[k].currency ?? null) === (b[k].currency ?? null)
    && (a[k].listPrice ?? null) === (b[k].listPrice ?? null)
    && (a[k].ratePct ?? null) === (b[k].ratePct ?? null));
}

/**
 * Kalem yazımının gösterim alanları: liste fiyatı ve oran ikisi de sayıysa ikisi birden, yoksa boş nesne
 * (anahtar hiç gönderilmez). Fiyat formülü tutmazsa veritabanı tetikleyicisi ikisini de siler.
 */
export function clinicListFields(
  listPrice: unknown,
  ratePct: unknown,
): { list_price: number; discount_percent: number } | Record<string, never> {
  if (listPrice == null || ratePct == null || listPrice === '' || ratePct === '') return {};
  const lp = Number(listPrice), rp = Number(ratePct);
  if (!Number.isFinite(lp) || !Number.isFinite(rp)) return {};
  return { list_price: lp, discount_percent: rp };
}
