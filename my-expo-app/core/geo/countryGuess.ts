// Varsayılan ülke tahmini (saf — test: countryGuess.test.mts). Sıra: IP (sunucu, /api/geo) →
// cihaz saat dilimi → dil etiketinin bölgesi → Türkiye. Kullanıcı formda her zaman değiştirebilir.
// İçe aktarma yok (node --test ile doğrudan çalışsın): geçerli kod denetimi parametreyle gelir.
const DEFAULT_COUNTRY = 'TR';
type IsCode = (c: string) => boolean;
const anyCode: IsCode = (c) => /^[A-Z]{2}$/.test(c);

// Müşteri tabanına yakın bölgeler; listede olmayan saat dilimi → bir sonraki kaynağa geçilir.
const TZ: Record<string, string> = {
  'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR',
  'Asia/Tehran': 'IR', 'Asia/Baku': 'AZ', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baghdad': 'IQ',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Jerusalem': 'IL',
  'Asia/Nicosia': 'CY', 'Asia/Famagusta': 'CY', 'Europe/Nicosia': 'CY', 'Asia/Tashkent': 'UZ',
  'Asia/Almaty': 'KZ', 'Asia/Bishkek': 'KG', 'Asia/Ashgabat': 'TM', 'Asia/Kabul': 'AF', 'Asia/Karachi': 'PK',
  'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Paris': 'FR', 'Europe/London': 'GB',
  'Europe/Dublin': 'IE', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Athens': 'GR',
  'Europe/Sofia': 'BG', 'Europe/Bucharest': 'RO', 'Europe/Belgrade': 'RS', 'Europe/Sarajevo': 'BA',
  'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Podgorica': 'ME', 'Europe/Zagreb': 'HR',
  'Europe/Ljubljana': 'SI', 'Europe/Chisinau': 'MD', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Moscow': 'RU', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Africa/Cairo': 'EG', 'Africa/Tripoli': 'LY', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ', 'Africa/Casablanca': 'MA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
};

export function countryFromTimeZone(tz: string | null | undefined): string | null {
  return (tz && TZ[tz]) || null;
}

/** "de-DE" / "fa_IR" → bölge; bölgesiz ("tr") ya da sayısal bölge ("en-001") → null. */
export function countryFromLocale(locale: string | null | undefined, isCode: IsCode = anyCode): string | null {
  const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(String(locale ?? ''));
  const c = m?.[1]?.toUpperCase() ?? null;
  return c && isCode(c) ? c : null;
}

export function pickCountry(
  src: { ip?: string | null; tz?: string | null; locale?: string | null },
  isCode: IsCode = anyCode,
): string {
  const ip = String(src.ip ?? '').toUpperCase();
  if (ip && isCode(ip)) return ip;
  return countryFromTimeZone(src.tz) ?? countryFromLocale(src.locale, isCode) ?? DEFAULT_COUNTRY;
}
