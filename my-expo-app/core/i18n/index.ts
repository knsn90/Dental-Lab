// core/i18n/index.ts
// Uygulama geneli i18n çatısı (i18next + react-i18next + expo-localization).
// Dil tercihi AsyncStorage'da saklanır (web'de localStorage'a iner; PWA + native ortak).
// Varsayılan TR; ilk açılışta kayıtlı tercih → cihaz dili → tr.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import tr from './locales/tr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import fa from './locales/fa.json';

export const SUPPORTED = ['tr', 'en', 'de', 'fa'] as const;
export type Lang = (typeof SUPPORTED)[number];

// Sağdan-sola diller (Farsça, Arapça…) — düzen aynalama için
export const RTL_LANGS: readonly string[] = ['fa', 'ar', 'he', 'ur'];
export function isRTL(l: string = i18n.language): boolean {
  return RTL_LANGS.includes(l);
}

const STORAGE_KEY = 'app_lang_v1';

// Intl formatlayıcıları için BCP-47 etiketi
// fa → Şemsi (Jalali) takvim: `-u-ca-persian` ile toLocaleDateString/Intl tarihleri
// otomatik Şemsi + Farsça ay adları (تیر…) verir. YALNIZ görüntüleme (Intl); saklanan
// ISO/parse edilen tarihler Miladi kalır → veri/mantık bozulmaz.
const TAGS: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fa: 'fa-IR-u-ca-persian' };
export function localeTag(l: string = i18n.language): string {
  return TAGS[(l as Lang)] ?? 'tr-TR';
}

function isSupported(l: string | undefined | null): l is Lang {
  return !!l && (SUPPORTED as readonly string[]).includes(l);
}

// İlk açılış dili: HER ZAMAN Türkçe. Kullanıcı Ayarlar'dan değiştirene kadar tr kalır.
// (Cihaz diline bakılmaz; kayıtlı tercih varsa aşağıda AsyncStorage'dan geri yüklenir.)
const initialLng: Lang = 'tr';

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
    de: { translation: de },
    fa: { translation: fa },
  },
  lng: initialLng,
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
  returnNull: false,
  // RN/web'de Suspense kullanmıyoruz — senkron init.
  react: { useSuspense: false },
});

// Kayıtlı tercihi (varsa) geri yükle — async, init'i bloklamaz.
AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (isSupported(saved) && saved !== i18n.language) {
    i18n.changeLanguage(saved);
  }
}).catch(() => { /* sessiz geç */ });

export async function setLanguage(lng: Lang): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, lng); } catch { /* yoksay */ }
  await i18n.changeLanguage(lng);
}

export default i18n;
