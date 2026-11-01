/**
 * Yeni kayıt / yeni klinik formunda VARSAYILAN ülke. Önce kendi /api/geo fonksiyonumuz
 * (Vercel'in IP'den verdiği ülke başlığı — üçüncü taraf yok, IP saklanmaz), olmazsa cihaz
 * saat dilimi ve dili, en sonda Türkiye. Oturum başına bir kez sorulur. Kullanıcı değiştirebilir.
 */
import { Platform } from 'react-native';
import { pickCountry } from './countryGuess';
import { isCountryCode } from '../data/countries';

let cached: Promise<string> | null = null;

async function ipCountry(): Promise<string | null> {
  const url = Platform.OS === 'web' ? '/api/geo' : 'https://siman.app/api/geo';
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl?.abort(), 2500);
    const res = await fetch(url, { signal: ctl?.signal as any });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return typeof j?.country === 'string' ? j.country : null;
  } catch {
    return null;
  }
}

export function detectCountry(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      let tz: string | null = null;
      let locale: string | null = null;
      try {
        const o = Intl.DateTimeFormat().resolvedOptions();
        tz = o.timeZone ?? null;
        locale = o.locale ?? null;
      } catch { /* Intl yok */ }
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') locale = navigator.language || locale;
      return pickCountry({ ip: await ipCountry(), tz, locale }, isCountryCode);
    })();
  }
  return cached;
}
