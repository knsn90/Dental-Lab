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

// ── Autocomplete ─────────────────────────────────────────────────────
export async function searchPlaces(input: string): Promise<PlaceSuggestion[]> {
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
