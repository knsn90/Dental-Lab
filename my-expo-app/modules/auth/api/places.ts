/**
 * Google Places API (New) wrapper — klinik adı autocomplete + adres çekme.
 *
 * - Session token: autocomplete + details aynı session sayılır → ~30% tasarruf
 * - Sadece Türkiye'ye filtreli (regionCode: 'tr')
 * - Diş klinikleri / sağlık kuruluşları öncelikli (includedPrimaryTypes)
 * - FieldMask ile sadece ihtiyacımız olan alanlar → düşük maliyet (Essentials SKU)
 */

const KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

// ── Tipler ───────────────────────────────────────────────────────────
export interface PlaceSuggestion {
  placeId: string;
  mainText: string;       // Örn: "Özel Acıbadem Dental"
  secondaryText: string;  // Örn: "Atatürk Cd., Kadıköy/İstanbul"
}

export interface PlaceDetails {
  name: string;
  phone: string;
  formattedAddress: string;
  il: string;
  ilce: string;
  mahalle: string;
  sokak: string;
  postaKodu: string;
  lat: number | null;
  lng: number | null;
  website: string;
}

/**
 * Türkçe-duyarlı, boşluk-duyarsız karşılaştırma anahtarı.
 * "Dt. Selin Odabaşı" → "dtselinodabasi"  ·  "oda başı" → "odabasi"
 */
export function trKey(s: string | null | undefined): string {
  return (s || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sorgunun HER kelimesi hedef alanlarda geçiyorsa eşleşme — kelime sırası
 * önemsiz. Kısmi kelime kabul edilir ("mah" → "Mahallesi"), böylece kullanıcı
 * adresi birebir yazmak zorunda kalmaz.
 */
export function matchesAllTokens(query: string, ...fields: (string | null | undefined)[]): boolean {
  const tokens = query.trim().split(/\s+/).map(trKey).filter((t) => t.length >= 2);
  if (!tokens.length) return false;
  const hay = fields.map(trKey).join('|');
  return tokens.every((t) => hay.includes(t));
}

// ── Session token (autocomplete + details aynı session) ──────────────
let currentSessionToken: string | null = null;

function newSessionToken(): string {
  // RFC4122 v4 — basit ve client-only yeterli
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function startPlaceSession() {
  currentSessionToken = newSessionToken();
  return currentSessionToken;
}

export function endPlaceSession() {
  currentSessionToken = null;
}

// ── Konum yanlılığı (opsiyonel) ──────────────────────────────────────
/** Aramayı bir noktanın çevresine ağırlıklandırır — kısıtlamaz, sıralamayı etkiler. */
export interface PlaceBias {
  lat: number;
  lng: number;
  /** Metre. Varsayılan 50 km — il ölçeğinde yeterli, komşu ili dışlamaz. */
  radiusM?: number;
}

function biasBody(bias?: PlaceBias | null) {
  if (!bias || !isFinite(bias.lat) || !isFinite(bias.lng)) return undefined;
  return {
    circle: {
      center: { latitude: bias.lat, longitude: bias.lng },
      radius: Math.min(Math.max(bias.radiusM ?? 50_000, 1), 50_000), // API tavanı 50 km
    },
  };
}

/**
 * Türkiye sınırlayıcı kutusu — `searchText` için.
 *
 * NEDEN GEREKLİ: `regionCode: 'tr'` sonuçları Türkiye ile SINIRLAMAZ, yalnız
 * biçimlendirmeyi/ağırlığı etkiler. Ölçüldü: "nexadent" araması sınırlama
 * olmadan Almanya, Kanada, Arjantin ve Hindistan'daki klinikleri döndürüyor,
 * İstanbul'daki gerçek laboratuvarı hiç göstermiyordu. Autocomplete'te bunun
 * karşılığı `includedRegionCodes`, searchText'te ise bu dikdörtgen.
 */
const TR_BOUNDS = {
  rectangle: {
    low:  { latitude: 35.8, longitude: 25.6 },
    high: { latitude: 42.2, longitude: 44.9 },
  },
};

// ── Autocomplete ─────────────────────────────────────────────────────
export async function searchPlaces(input: string, bias?: PlaceBias | null): Promise<PlaceSuggestion[]> {
  if (!KEY) {
    // eslint-disable-next-line no-console
    console.warn('[places] EXPO_PUBLIC_GOOGLE_PLACES_KEY tanımlı değil');
    return [];
  }
  if (!input || input.trim().length < 3) return [];
  if (!currentSessionToken) startPlaceSession();

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
      },
      body: JSON.stringify({
        input: input.trim(),
        languageCode: 'tr',
        regionCode: 'tr',
        // includedPrimaryTypes kasıtlı olarak verilmiyor — kurum adı geniş eşleşsin
        sessionToken: currentSessionToken,
        // Sonuçları Türkiye ile SINIRLA — regionCode tek başına yetmiyor (bkz. TR_BOUNDS)
        includedRegionCodes: ['tr'],
        locationBias: biasBody(bias),
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[places] autocomplete failed:', res.status, await res.text());
      return [];
    }
    const j = await res.json();
    const suggestions = (j.suggestions ?? []) as any[];
    return suggestions
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({
        placeId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondaryText: p.structuredFormat?.secondaryText?.text || '',
      }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[places] autocomplete error:', e);
    return [];
  }
}

// ── Text Search (geniş eşleşme) ──────────────────────────────────────
/**
 * `places:searchText` — autocomplete'in bulamadığını bulur.
 *
 * FARK: autocomplete bir ÖN EK tahminidir ("selin oda" → "Selin Odabaşı…"),
 * text search ise serbest bir sorguyu tüm alanlarda arar ("ataşehir diş hekimi
 * selin" gibi tarif eden cümleleri de eşleştirir). Bu yüzden sadece FALLBACK
 * olarak çağrılır: SKU'su autocomplete'ten pahalı ve oturum jetonuna girmez.
 */
export async function searchPlacesText(input: string, bias?: PlaceBias | null): Promise<PlaceSuggestion[]> {
  if (!KEY) return [];
  const q = input.trim();
  if (q.length < 3) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: q,
        languageCode: 'tr',
        regionCode: 'tr',
        maxResultCount: 8,
        // Bias ve restriction birlikte gönderilemez; koordinat varsa onu
        // (daha isabetli), yoksa Türkiye kutusunu kullan.
        ...(biasBody(bias) ? { locationBias: biasBody(bias) } : { locationRestriction: TR_BOUNDS }),
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[places] searchText failed:', res.status, await res.text());
      return [];
    }
    const j = await res.json();
    return ((j.places ?? []) as any[])
      .filter((p) => p?.id)
      .map((p) => ({
        placeId: p.id as string,
        mainText: p.displayName?.text || '',
        secondaryText: p.formattedAddress || '',
      }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[places] searchText error:', e);
    return [];
  }
}

/**
 * Geniş arama — kullanıcı ne yazarsa yazsın bir sonuç çıkarmaya çalışır.
 *
 * İki kademe, çünkü ikinci kademe daha pahalı bir SKU: ilki yeterliyse hiç
 * çalışmaz.
 *   1. autocomplete — ön ek tahmini, ucuz, çoğu adres/zincir için yeterli
 *   2. searchText   — serbest metin, ünvanlı kurum adlarını bulan tek yol
 *
 * ÖLÇÜM (canlı API, "Dt. Selin Odabaşı"): autocomplete ham girdiyle de,
 * ünvanı atılmış "Selin Odabaşı" ile de SIFIR sonuç döndü; searchText ham
 * girdiyle "Ataşehir Diş Hekimi Selin Odabaşı"yı buldu. Bu yüzden araya bir
 * "ünvanı temizle ve tekrar dene" adımı konmadı — ölçülebilir faydası yokken
 * her aramaya bir ücretli çağrı daha eklerdi.
 *
 * Sonuçlar placeId ile tekilleştirilir; autocomplete sonuçları üstte kalır.
 */
export async function searchAddressesWide(
  input: string,
  bias?: PlaceBias | null,
): Promise<PlaceSuggestion[]> {
  const raw = input.trim();
  if (raw.length < 3) return [];

  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  const push = (list: PlaceSuggestion[]) => {
    for (const s of list) {
      if (!s.placeId || seen.has(s.placeId)) continue;
      seen.add(s.placeId);
      out.push(s);
    }
  };

  push(await searchPlaces(raw, bias));
  if (hasStrongMatch(raw, out)) return out;

  push(await searchPlacesText(raw, bias));
  return out;
}

/**
 * Autocomplete gerçekten aranan yeri buldu mu?
 *
 * "Sonuç sayısı yeterli" ölçütü YANILTICI: ölçüldü — "nexadent" araması
 * autocomplete'ten üç sonuç döndürüyor ama üçü de yakın-yazılışlı BAŞKA
 * yerler (Nevadent, Novadent, Neva Dent); aranan laboratuvar listede yok.
 * Sayıya bakıp erken çıkılsaydı, doğru sonucu bulan searchText hiç
 * çalışmayacaktı. Bu yüzden ölçüt: sonuçlardan BİRİ sorgunun tüm
 * kelimelerini içeriyor mu.
 *
 * Kelime bazlı, bütün-dize değil: "Barbaros mah Ataşehir" sorgusu "Barbaros
 * Mahallesi, Ataşehir/İstanbul" sonucuyla kelime kelime örtüşür ama bitişik
 * dize olarak örtüşmez — bütün-dize ölçütü burada gereksiz yere ikinci
 * (pahalı) çağrıyı tetikliyordu.
 */
function hasStrongMatch(query: string, results: PlaceSuggestion[]): boolean {
  return results.some((r) => matchesAllTokens(query, r.mainText, r.secondaryText));
}

// ── Place Details ────────────────────────────────────────────────────
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!KEY) return null;
  try {
    // FieldMask — Essentials + nationalPhoneNumber (Pro) + websiteUri
    // Eski adres parsing için addressComponents
    const fieldMask = [
      'displayName',
      'formattedAddress',
      'addressComponents',
      'nationalPhoneNumber',
      'location',
      'websiteUri',
    ].join(',');

    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${currentSessionToken || ''}&languageCode=tr&regionCode=tr`,
      {
        headers: {
          'X-Goog-Api-Key': KEY,
          'X-Goog-FieldMask': fieldMask,
        },
      },
    );
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[places] details failed:', res.status, await res.text());
      return null;
    }
    const j = await res.json();
    // details çağrısı session'ı kapatır
    endPlaceSession();

    const components = (j.addressComponents ?? []) as any[];
    const find = (type: string): string => {
      const c = components.find((cc) => cc.types?.includes(type));
      return c?.longText || c?.shortText || '';
    };

    const il = find('administrative_area_level_1');
    const ilce = find('administrative_area_level_2');
    let mahalle =
      find('administrative_area_level_4') ||
      find('sublocality_level_1') ||
      find('sublocality') ||
      find('neighborhood') ||
      '';
    // Mahalle fallback: formattedAddress'in başında "X Mah." / "X Mh." varsa al
    if (!mahalle && j.formattedAddress) {
      const m = String(j.formattedAddress).match(/^([^,]+?)\s*(Mah|Mh)\.?/i);
      if (m) mahalle = m[1].trim();
    }
    // "Mah." / "Mh." son ek varsa kaldır (DB'de salt mahalle adı tutuluyor)
    mahalle = mahalle.replace(/\s*(Mah|Mh)\.?$/i, '').trim();

    // Sokak/Cadde: route + street_number birleştir, yoksa formattedAddress'ten çıkar
    const route = find('route');
    const streetNumber = find('street_number');
    const premise = find('premise'); // bina adı/no (Türkiye'de sıkça gelir)
    let sokak = '';
    if (route) {
      sokak = streetNumber ? `${route} No:${streetNumber}` : route;
      if (premise) sokak = `${sokak}, ${premise}`;
    } else if (premise) {
      sokak = premise;
    }

    // Fallback: formattedAddress'ten parse et
    // Örn: "Yeni Mh., Atatürk Cd. No:12, 34000 Üsküdar/İstanbul"
    if (!sokak && j.formattedAddress) {
      const parts = String(j.formattedAddress).split(',').map((p: string) => p.trim());
      // İl/ilçe/posta kodu içermeyen ve mahalle olmayan parçayı seç
      const candidates = parts.filter((p) => {
        if (!p) return false;
        // Posta kodu içeriyorsa atla (5 haneli rakam + il)
        if (/\b\d{5}\b/.test(p)) return false;
        // "Mh." veya "Mah." ile bitiyorsa mahalle
        if (/\b(Mh|Mah)\.?$/i.test(p)) return false;
        // Sadece il/ilçe ise atla
        if (p === il || p === ilce) return false;
        if (p.includes('/')) return false; // "Üsküdar/İstanbul"
        return true;
      });
      // En "sokak/cadde" gibi olanı seç — Cd/Sk/Bulv içerenler öncelikli
      const streetLike = candidates.find((p) => /\b(Cd|Cad|Sk|Sok|Bulv|Bulvar)\.?/i.test(p));
      sokak = streetLike || candidates[0] || '';
    }

    const postaKodu = find('postal_code');

    const phoneRaw: string = j.nationalPhoneNumber || '';
    const phone = phoneRaw.replace(/\s+/g, ' ').trim();

    return {
      name: j.displayName?.text || '',
      phone,
      formattedAddress: j.formattedAddress || '',
      il,
      ilce,
      mahalle,
      sokak,
      postaKodu,
      lat: j.location?.latitude ?? null,
      lng: j.location?.longitude ?? null,
      website: j.websiteUri || '',
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[places] details error:', e);
    return null;
  }
}
