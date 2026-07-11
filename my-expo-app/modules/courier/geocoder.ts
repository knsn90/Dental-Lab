// Ortak Türkiye adres geocoder'ı — Nominatim üzerinden.
// Adres formatı (format_clinic_address): "mahalle, sokak No: bina, posta_kodu, ilce, il"
// Eski format: "mahalle, ilce, il"
// Strateji: en spesifikten en kaba sonuca doğru birkaç sorgu dener,
// ilk dolu cevabı döndürür.

export interface GeoCoord { lat: number; lng: number; }

interface ParsedAddr {
  mahalle: string | null;
  sokak: string | null;     // bina dahil ("Vatan Caddesi No: 21")
  postaKodu: string | null; // 5 haneli
  ilce: string | null;
  il: string | null;
}

const POSTCODE_RE = /^\d{5}$/;

function parseAddress(raw: string): ParsedAddr {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  // Default: hiçbir şey yok
  const out: ParsedAddr = { mahalle: null, sokak: null, postaKodu: null, ilce: null, il: null };
  if (parts.length === 0) return out;

  // Son iki: ilce, il
  if (parts.length >= 2) {
    out.il   = parts[parts.length - 1] || null;
    out.ilce = parts[parts.length - 2] || null;
  } else {
    out.il = parts[0] || null;
  }

  // Aradaki posta kodu (5 hane) tespit
  const middle = parts.slice(0, Math.max(0, parts.length - 2));
  const pkIdx = middle.findIndex(p => POSTCODE_RE.test(p));
  if (pkIdx !== -1) {
    out.postaKodu = middle[pkIdx];
    middle.splice(pkIdx, 1);
  }

  // Kalan ortadakilerden mahalle (ilk) ve sokak (kalan)
  if (middle.length > 0) out.mahalle = middle[0];
  if (middle.length > 1) out.sokak = middle.slice(1).join(', ');

  return out;
}

const cache = new Map<string, GeoCoord | null>();
const LS_KEY = 'geocoder_tr_v1';
const LS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
type LsEntry = { c: GeoCoord | null; t: number };

function lsGet(key: string): GeoCoord | null | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(`${LS_KEY}:${key}`);
    if (!raw) return undefined;
    const e: LsEntry = JSON.parse(raw);
    if (Date.now() - e.t > LS_TTL_MS) {
      window.localStorage.removeItem(`${LS_KEY}:${key}`);
      return undefined;
    }
    return e.c;
  } catch { return undefined; }
}

function lsSet(key: string, c: GeoCoord | null) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${LS_KEY}:${key}`, JSON.stringify({ c, t: Date.now() } as LsEntry));
  } catch { /* quota dolarsa sessizce geç */ }
}

export async function geocodeTR(rawAddress: string): Promise<GeoCoord | null> {
  const key = rawAddress.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const ls = lsGet(key);
  if (ls !== undefined) { cache.set(key, ls); return ls; }

  const a = parseAddress(rawAddress);
  const urls: string[] = [];
  const enc = encodeURIComponent;

  // 1) En spesifik: sokak + mahalle + ilçe + il + posta kodu (free-text)
  if (a.sokak && (a.ilce || a.il)) {
    const full = [a.sokak, a.mahalle, a.ilce, a.il, 'Türkiye'].filter(Boolean).join(', ');
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&addressdetails=1&q=${enc(full)}`);
  }

  // 2) Structured: street=<sokak>, city=<ilce>, state=<il>, postalcode=<pk>
  if (a.sokak && a.ilce && a.il) {
    const pk = a.postaKodu ? `&postalcode=${enc(a.postaKodu)}` : '';
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&addressdetails=1&street=${enc(a.sokak)}&city=${enc(a.ilce)}&state=${enc(a.il)}${pk}`);
  }

  // 3) Sokak yoksa: mahalle ile structured
  if (!a.sokak && a.mahalle && a.ilce && a.il) {
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&street=${enc(a.mahalle)}&city=${enc(a.ilce)}&state=${enc(a.il)}`);
  }

  // 4) Mahalle + ilçe + il (free-text)
  if (a.mahalle && a.ilce && a.il) {
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&q=${enc(`${a.mahalle}, ${a.ilce}, ${a.il}, Türkiye`)}`);
  }

  // 5) Posta kodu yalnız
  if (a.postaKodu) {
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&postalcode=${enc(a.postaKodu)}&country=Türkiye`);
  }

  // 6) İlçe + il (kaba)
  if (a.ilce && a.il) {
    urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&q=${enc(`${a.ilce}, ${a.il}, Türkiye`)}`);
  }

  // 7) Son çare: raw
  urls.push(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&q=${enc(`${rawAddress}, Türkiye`)}`);

  // Tüm sorguları paralel başlat (5–15s'lik seri zinciri ~1s'e indirir).
  // Sonuçları öncelik sırasına göre (en spesifik önce) değerlendir; ilk geçerli
  // koordinatı bul. Bir sorgu daha düşük öncelikli olsa bile, daha spesifik
  // sorgu hâlâ devam ediyorsa onun cevabı beklenmez — sıralı kontrol yapılır.
  type R = { idx: number; coord: GeoCoord | null };
  const fetchOne = async (url: string, idx: number): Promise<R> => {
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'tr' } });
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        const c: GeoCoord = { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
        if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) return { idx, coord: c };
      }
    } catch { /* ignore */ }
    return { idx, coord: null };
  };
  const results = await Promise.all(urls.map((u, i) => fetchOne(u, i)));
  results.sort((a, b) => a.idx - b.idx);
  for (const r of results) {
    if (r.coord) { cache.set(key, r.coord); lsSet(key, r.coord); return r.coord; }
  }
  cache.set(key, null);
  lsSet(key, null);
  return null;
}

// Test/debug için parse fonksiyonunu da expose et
export { parseAddress as _parseAddressForDebug };
