// Ortak Türkiye adres geocoder'ı — Nominatim üzerinden.
//
// İki girdi biçimini de kabul eder:
//   1) JSON adres (klinik/hekim kayıtlarındaki kanonik biçim) —
//      {"il":"İstanbul","ilce":"Ataşehir","mahalle":"Atatürk","sokak":"...","bina_no":"B Blok","posta_kodu":"34758"}
//      Bu yol KESİN: alanlar doğrudan Nominatim'in structured parametrelerine gider.
//   2) Düz metin — "sokak No: bina, mahalle Mah., ilce/il, posta_kodu" (formatAddress çıktısı)
//      ya da eski "mahalle, ilce, il" biçimi.
//
// ÖNEMLİ (bu dosyanın var oluş sebebi): eski parser "il = son parça" varsayıyordu.
// formatAddress posta kodunu SONA, ilçe+ili "Ataşehir/İstanbul" biçiminde tek parçaya
// koyduğu için il=34758, ilce="Ataşehir/İstanbul" çıkıyor, tüm spesifik sorgular boş
// dönüyor ve pin ilçe merkezine (kaba fallback) düşüyordu.
//
// Strateji: en spesifikten kabaya sıralı sorgu listesi; her sonuç beklenen ilçe/il
// içinde mi diye DOĞRULANIR (yanlış şehirdeki isim benzerliği elenir).

export interface GeoCoord { lat: number; lng: number; }

interface ParsedAddr {
  mahalle: string | null;
  sokak: string | null;     // sade cadde/sokak adı (site adı ve bina no ayrılmış)
  binaNo: string | null;    // "21", "B Blok" vb.
  poi: string | null;       // site/apartman/plaza adı — "Metropol İstanbul" gibi
  postaKodu: string | null; // 5 haneli
  ilce: string | null;
  il: string | null;
}

const POSTCODE_RE = /^\d{5}$/;
const STREET_RE = /(sokak|sokağı|sokagi|\bsk\.?$|cadde|caddesi|\bcd\.?$|\bcad\.?$|bulvar|bulvarı|\bblv\.?$|mevkii|yolu)/i;
const MAHALLE_RE = /(mahalle|mahallesi|\bmah\.?$)/i;

/** Türkçe duyarsız karşılaştırma için normalize: "Ataşehir" → "atasehir". */
function norm(s: string): string {
  return String(s)
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Vatan Caddesi No.21" / "... No: 21" → { sokak, binaNo } */
function splitBina(s: string): { sokak: string; binaNo: string | null } {
  const m = s.match(/\bno[:.\s]*\s*(.+)$/i);
  if (m) return { sokak: s.slice(0, m.index).replace(/[,\s]+$/, '').trim(), binaNo: m[1].trim() || null };
  return { sokak: s.trim(), binaNo: null };
}

/** "Atatürk Mah." / "Atatürk Mahallesi" → "Atatürk" */
function bareMahalle(s: string): string {
  return s.replace(/\s*(mahallesi|mahalle|mah\.?)\s*$/i, '').trim();
}

/** JSON adres → ParsedAddr (kesin yol). JSON değilse null. */
function parseJsonAddress(raw: string): ParsedAddr | null {
  const s = raw.trim();
  if (!(s.startsWith('{') && s.endsWith('}'))) return null;
  let o: any;
  try { o = JSON.parse(s); } catch { return null; }
  if (!o || typeof o !== 'object') return null;

  const rawSokak = String(o.sokak ?? '').trim();
  // "Ertuğrul Gazi Sokak, Metropol İstanbul" → sokak + site adı (POI)
  const segs = rawSokak.split(',').map((x: string) => x.trim()).filter(Boolean);
  const streetSeg = segs.find(x => STREET_RE.test(x)) ?? segs[0] ?? '';
  const poiSeg = segs.filter(x => x !== streetSeg).join(', ') || null;
  const { sokak, binaNo } = splitBina(streetSeg);

  const pk = String(o.posta_kodu ?? '').trim();
  return {
    mahalle:   o.mahalle ? bareMahalle(String(o.mahalle).trim()) : null,
    sokak:     sokak || null,
    binaNo:    binaNo ?? (String(o.bina_no ?? '').trim() || null),
    poi:       poiSeg,
    postaKodu: POSTCODE_RE.test(pk) ? pk : null,
    ilce:      String(o.ilce ?? '').trim() || null,
    il:        String(o.il ?? '').trim() || null,
  };
}

/** Düz metin adres → ParsedAddr. formatAddress çıktısı ve eski biçimler desteklenir. */
function parseAddress(raw: string): ParsedAddr {
  const json = parseJsonAddress(raw);
  if (json) return json;

  const out: ParsedAddr = {
    mahalle: null, sokak: null, binaNo: null, poi: null, postaKodu: null, ilce: null, il: null,
  };
  let parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return out;

  // 1) Posta kodu NEREDE olursa olsun ayıkla (formatAddress sona koyuyor).
  const pkIdx = parts.findIndex(p => POSTCODE_RE.test(p));
  if (pkIdx !== -1) { out.postaKodu = parts[pkIdx]; parts.splice(pkIdx, 1); }

  // 2) "Ataşehir/İstanbul" birleşik parçası → ilçe + il
  const slashIdx = parts.findIndex(p => /^[^/]+\/[^/]+$/.test(p));
  if (slashIdx !== -1) {
    const [ilce, il] = parts[slashIdx].split('/').map(s => s.trim());
    out.ilce = ilce || null; out.il = il || null;
    parts.splice(slashIdx, 1);
  } else if (parts.length >= 2) {
    // Eski biçim: "... , ilce, il"
    out.il = parts.pop() || null;
    out.ilce = parts.pop() || null;
  } else {
    out.il = parts.pop() || null;
  }

  // 3) Kalanlardan mahalle / sokak / POI ayrıştır
  const rest: string[] = [];
  for (const p of parts) {
    if (!out.mahalle && MAHALLE_RE.test(p)) { out.mahalle = bareMahalle(p); continue; }
    if (!out.sokak && STREET_RE.test(p)) {
      const { sokak, binaNo } = splitBina(p);
      out.sokak = sokak || null;
      if (binaNo) out.binaNo = binaNo;
      continue;
    }
    rest.push(p);
  }
  // Sokak bulunamadıysa ilk kalan parçayı sokak say (eski "mahalle, ilce, il" biçimi
  // için mahalle zaten yakalanır; yakalanmadıysa ilk parça mahalle olarak kullanılır).
  if (!out.sokak && !out.mahalle && rest.length) out.mahalle = bareMahalle(rest.shift()!);

  // Kalanlar: site/apartman adı + bina no ("ESF Apartmanı D:2", "B Blok")
  const leftover: string[] = [];
  for (const p of rest) {
    const { sokak, binaNo } = splitBina(p);
    if (binaNo && !out.binaNo) { out.binaNo = binaNo; if (sokak) leftover.push(sokak); continue; }
    leftover.push(p);
  }
  out.poi = leftover.join(', ') || null;

  return out;
}

const cache = new Map<string, GeoCoord | null>();
// v2: v1 önbelleğindeki YANLIŞ (ilçe merkezine düşmüş) koordinatlar geçersiz sayılsın.
const LS_KEY = 'geocoder_tr_v2';
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

type Query = {
  params: Record<string, string>;
  /** true → sonuç beklenen ilçe içinde mi diye doğrula (kaba fallback'lerde false). */
  strict: boolean;
};

const BASE = 'https://nominatim.openstreetmap.org/search';

function buildUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({
    format: 'json', countrycodes: 'tr', limit: '1', addressdetails: '1', ...params,
  });
  return `${BASE}?${qs.toString()}`;
}

/** Sonuç beklenen ilçe/il içinde mi? Nominatim isim benzerliğiyle başka şehre kayabiliyor. */
function matchesArea(hit: any, a: ParsedAddr): boolean {
  const hay = norm([hit?.display_name, JSON.stringify(hit?.address ?? {})].join(' '));
  if (a.ilce && !hay.includes(norm(a.ilce))) return false;
  if (a.il && !hay.includes(norm(a.il))) return false;
  return true;
}

function buildQueries(a: ParsedAddr, rawAddress: string): Query[] {
  const qs: Query[] = [];
  const city = a.ilce ?? undefined;
  const state = a.il ?? undefined;
  const areaOk = !!(city && state);

  // 1) EN SPESİFİK — structured: street=<sade sokak>, city=<ilçe>, state=<il>, postalcode
  //    Nominatim TR adreslerinde tek güvenilir yol bu; free-text "sokak, mahalle, ilçe"
  //    neredeyse her zaman boş döner.
  if (a.sokak && areaOk) {
    if (a.postaKodu) qs.push({ params: { street: a.sokak, city: city!, state: state!, postalcode: a.postaKodu }, strict: true });
    qs.push({ params: { street: a.sokak, city: city!, state: state! }, strict: true });
    if (a.binaNo && /^\d/.test(a.binaNo)) {
      // Sayısal bina no'da "21 Vatan Caddesi" biçimi Nominatim'in beklediği yazımdır.
      qs.push({ params: { street: `${a.binaNo} ${a.sokak}`, city: city!, state: state! }, strict: true });
    }
  }

  // 2) Site/plaza adı (POI) — "Metropol İstanbul, Ataşehir, İstanbul"
  if (a.poi && areaOk) {
    qs.push({ params: { q: `${a.poi}, ${city}, ${state}, Türkiye` }, strict: true });
  }

  // 3) Mahalle seviyesi — sokak çözülemezse en azından doğru mahalleye düşsün
  if (a.mahalle && areaOk) {
    qs.push({ params: { q: `${a.mahalle} Mahallesi, ${city}, ${state}, Türkiye` }, strict: true });
    qs.push({ params: { street: `${a.mahalle} Mahallesi`, city: city!, state: state! }, strict: true });
  }

  // 4) Ham metin (tam adres) — bazen Nominatim'in kendi parser'ı tutturur
  qs.push({ params: { q: `${rawAddress.replace(/[{}"]/g, ' ').replace(/\s+/g, ' ').trim()}, Türkiye` }, strict: true });

  // 5) KABA FALLBACK'ler — buraya düşmek "yaklaşık konum" demektir.
  if (a.postaKodu) qs.push({ params: { postalcode: a.postaKodu, country: 'Türkiye' }, strict: false });
  if (areaOk)      qs.push({ params: { q: `${city}, ${state}, Türkiye` }, strict: false });
  else if (state)  qs.push({ params: { q: `${state}, Türkiye` }, strict: false });

  return qs;
}

async function runQuery(q: Query, a: ParsedAddr): Promise<GeoCoord | null> {
  try {
    const res = await fetch(buildUrl(q.params), { headers: { 'Accept-Language': 'tr' } });
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return null;
    const hit = json[0];
    if (q.strict && !matchesArea(hit, a)) return null;
    const c: GeoCoord = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    return Number.isFinite(c.lat) && Number.isFinite(c.lng) ? c : null;
  } catch { return null; }
}

export async function geocodeTR(rawAddress: string): Promise<GeoCoord | null> {
  const key = String(rawAddress ?? '').trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const ls = lsGet(key);
  if (ls !== undefined) { cache.set(key, ls); return ls; }

  const a = parseAddress(rawAddress);
  const queries = buildQueries(a, rawAddress);

  // Dalga dalga çalıştır: ilk dalga (en spesifik 3 sorgu) genelde tutar; tutmazsa
  // kalanlar denenir. Hepsini birden atmak Nominatim'in kullanım politikasını zorluyor.
  const finish = (c: GeoCoord | null) => { cache.set(key, c); lsSet(key, c); return c; };
  for (let i = 0; i < queries.length; i += 3) {
    const wave = queries.slice(i, i + 3);
    const results = await Promise.all(wave.map(q => runQuery(q, a)));
    const hit = results.find(Boolean);
    if (hit) return finish(hit);
  }
  return finish(null);
}

// Test/debug için parse fonksiyonunu da expose et
export { parseAddress as _parseAddressForDebug };
