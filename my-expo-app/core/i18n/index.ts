// core/i18n/index.ts
// Uygulama geneli i18n çatısı (i18next + react-i18next + expo-localization).
// Dil tercihi AsyncStorage'da saklanır (web'de localStorage'a iner; PWA + native ortak).
// Varsayılan TR; ilk açılışta kayıtlı tercih → cihaz dili → tr.

import i18n from 'i18next';
import * as Localization from 'expo-localization';
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

/**
 * Yönlü ikon adını aktif yöne göre aynalar.
 *
 * `dir=rtl` düzeni aynalar ama İKON ÇİZİMİNİ aynalamaz: "önceki" düğmesi RTL'de
 * sağa geçer, içindeki chevron hâlâ sola bakar. Sola bakan ok sağdaki düğmede
 * "geri" demez. Yalnız yön BİLDİREN ikonlar çevrilir — check, close, search gibi
 * yönsüz ikonlar dokunulmadan geçer.
 */
const MIRRORED_ICONS: Record<string, string> = {
  'chevron-left': 'chevron-right',   'chevron-right': 'chevron-left',
  'chevrons-left': 'chevrons-right', 'chevrons-right': 'chevrons-left',
  'arrow-left': 'arrow-right',       'arrow-right': 'arrow-left',
  'arrow-left-circle': 'arrow-right-circle', 'arrow-right-circle': 'arrow-left-circle',
  'corner-down-left': 'corner-down-right',   'corner-down-right': 'corner-down-left',
};
export function dirIcon<T extends string>(name: T): T {
  return (isRTL() ? (MIRRORED_ICONS[name] ?? name) : name) as T;
}

const STORAGE_KEY = 'app_lang_v1';
// Kullanıcı dili KENDİ seçti mi? Bölge varsayılanı yalnız bu yokken uygulanır.
const LANG_EXPLICIT_KEY = 'app_lang_explicit_v1';

// Intl formatlayıcıları için BCP-47 etiketi
// fa → Şemsi (Jalali) takvim: `-u-ca-persian` ile toLocaleDateString/Intl tarihleri
// otomatik Şemsi + Farsça ay adları (تیر…) verir. YALNIZ görüntüleme (Intl); saklanan
// ISO/parse edilen tarihler Miladi kalır → veri/mantık bozulmaz.
const TAGS: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fa: 'fa-IR' };

// ── Takvim tercihi (yalnız Farsça'da anlamlı) ─────────────────────────────
//
// Farsça konuşan herkes Şemsi kullanmaz: İran'da Şemsi resmîdir, ama Afgan/
// diasporadaki kullanıcı ya da Farsça arayüz kullanan Türk lab Miladi bekler.
// Bu yüzden takvim dile DEĞİL, bölgeye/tercihe bağlı.
//
//   'auto'      → cihaz saat dilimi Asia/Tehran ise Şemsi, değilse Miladi
//   'persian'   → her zaman Şemsi
//   'gregorian' → her zaman Miladi
//
// SAKLANAN VERİ ETKİLENMEZ: bu yalnız Intl görüntülemesidir; ISO tarihler ve
// parse edilen değerler her zaman Miladi kalır.
export type CalendarPref = 'auto' | 'gregorian' | 'persian';
const CAL_KEY = 'app_calendar_v1';
let calendarPref: CalendarPref = 'auto';

function deviceIsIran(): boolean {
  try {
    return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').startsWith('Asia/Tehran');
  } catch { return false; }
}

// ── Lab bölgesi ipucu ─────────────────────────────────────────────────────
// lab_settings.region yüklenince buraya bildirilir. Cihaz saat diliminden
// DAHA GÜÇLÜ bir sinyaldir: İranlı labın Türkiye'deki muhasebecisi de Şemsi
// görmeli, çünkü işin bağlamı İran.
let labRegionIsIran = false;

/**
 * Lab ayarları yüklendiğinde çağrılır. İki şey yapar:
 *   1. Takvim 'auto' modunun bölge sinyalini günceller.
 *   2. Kullanıcı DAHA ÖNCE dil seçmemişse İran labında Farsça'ya geçer.
 *
 * Açık tercihe ASLA dokunmaz: kullanıcı bir kez dil seçtiyse (AsyncStorage'da
 * kayıt varsa) burada değiştirilmez — İranlı labın Türk yöneticisi Türkçe
 * kalabilmeli.
 */
export async function applyLabRegionDefaults(region: 'TR' | 'IR'): Promise<void> {
  const wasIran = labRegionIsIran;
  labRegionIsIran = region === 'IR';

  if (labRegionIsIran) {
    try {
      const chosen = await AsyncStorage.getItem(LANG_EXPLICIT_KEY);
      // Kullanıcı hiç dil SEÇMEDİYSE Farsça'ya geç. Kayıtlı dil değeri tek
      // başına yetmez: cihazdan türetilen açılış dili de oraya yazılıyor.
      if (!chosen && i18n.language !== 'fa') await setLanguage('fa', { explicit: false });
    } catch { /* sessiz geç */ }
  }
  // Takvim 'auto' ise bölge değişimi görüntüyü etkiler → ağacı tazele.
  if (wasIran !== labRegionIsIran && calendarPref === 'auto') {
    try { (i18n as any).emit?.('languageChanged', i18n.language); } catch { /* yoksay */ }
  }
}

export function getCalendarPref(): CalendarPref { return calendarPref; }

/** Şu an Şemsi mi gösteriliyor? Ayar ekranı ve önizleme bunu okur. */
/**
 * Haftanın ilk günü (JS getDay() kodu): İran'da Cumartesi (6), diğer bölgelerde
 * Pazartesi (1). Bölgesel bir iş takvimi kuralı olduğu için takvim tercihine
 * (şemsi/miladi) DEĞİL, labın bölgesine bağlıdır — miladi takvim seçen İranlı
 * bir lab da haftaya şenbe ile başlar.
 */
/**
 * TAKVİM-DUYARLI TARİH BİÇİMLENDİRİCİLER.
 *
 * Panel başlıkları tarihi sabit ay-adı dizisinden kuruyordu
 * (`MONTHS_TR[d.getMonth()]`) ve sözlük o adı çeviriyordu — sonuç Farsça yazılmış
 * MİLADİ ay oluyordu ("۱۹ اوت"), şemsi takvim seçiliyken bile. Intl'e localeTag()
 * verildiğinde (fa-IR-u-ca-persian) gün ve ay gerçekten Celali'ye çevrilir.
 *
 * Parçalar ayrı ayrı biçimlenip elle birleştirilir: tek çağrıda {weekday, day,
 * month} vermek Türkçede sırayı "19 Ağustos Çarşamba"ya çevirip mevcut görünümü
 * değiştirirdi.
 */
function part(d: Date, opts: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat(localeTag(), opts).format(d); }
  catch { return ''; }
}

/** «Çarşamba, 19 Ağustos» / «چهارشنبه، ۲۸ مرداد» */
export function fmtWeekdayDayMonth(d: Date, sep: string = ', '): string {
  return `${part(d, { weekday: 'long' })}${sep}${part(d, { day: 'numeric', month: 'long' })}`;
}

/** «19 Ağustos 2026» / «۲۸ مرداد ۱۴۰۵» */
export function fmtDayMonthYear(d: Date): string {
  return part(d, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «19 Ağu» — grafik/aralık etiketleri */
export function fmtDayMonthShort(d: Date): string {
  return part(d, { day: 'numeric', month: 'short' });
}

/** «Ağu» — grafik ekseni */
export function fmtMonthShort(d: Date): string {
  return part(d, { month: 'short' });
}

/**
 * Lab ayarındaki açık tercih (lab_settings.week_start). 'auto' ya da yoksa
 * bölgeden türetilir. Store buraya PUSH eder — core/i18n labSettingsStore'u
 * import edemez (store zaten applyLabRegionDefaults için buradan import ediyor,
 * ters yön döngü olurdu).
 */
let labWeekStart: 'auto' | 'monday' | 'saturday' | 'sunday' = 'auto';

export function setLabWeekStart(v: 'auto' | 'monday' | 'saturday' | 'sunday'): void {
  labWeekStart = v ?? 'auto';
}

export function weekStartsOn(): 0 | 1 | 6 {
  if (labWeekStart === 'monday')   return 1;
  if (labWeekStart === 'saturday') return 6;
  if (labWeekStart === 'sunday')   return 0;
  return (labRegionIsIran || deviceIsIran()) ? 6 : 1;
}

/** Bir tarihin, haftanın ilk gününe göre 0..6 arası sütun sırası. */
export function weekdayOffset(weekday: number): number {
  return (weekday - weekStartsOn() + 7) % 7;
}

export function usesPersianCalendar(l: string = i18n.language): boolean {
  if (l !== 'fa') return false;
  if (calendarPref === 'persian')   return true;
  if (calendarPref === 'gregorian') return false;
  return labRegionIsIran || deviceIsIran();
}

export async function setCalendarPref(p: CalendarPref): Promise<void> {
  calendarPref = p;
  try { await AsyncStorage.setItem(CAL_KEY, p); } catch { /* yoksay */ }
  // Tarih gösterimi HER ekranda değişir → ağacı tazele (kök düzen anahtarında).
  try { (i18n as any).emit?.('languageChanged', i18n.language); } catch { /* yoksay */ }
}

export function localeTag(l: string = i18n.language): string {
  // Düz 'fa-IR' ICU'da ZATEN Celali veriyor; miladi istendiğinde takvimi açıkça
  // zorlamak şart, yoksa "Farsça ama İran değil → miladi" kuralı hiç işlemiyordu.
  if (l === 'fa') return usesPersianCalendar(l) ? 'fa-IR-u-ca-persian' : 'fa-IR-u-ca-gregory';
  return TAGS[(l as Lang)] ?? 'tr-TR';
}

function isSupported(l: string | undefined | null): l is Lang {
  return !!l && (SUPPORTED as readonly string[]).includes(l);
}

/**
 * İLK açılış dili — kullanıcı henüz hiç seçim yapmamışken.
 *
 * Kayıtlı tercih varsa bu hiç kullanılmaz (aşağıda AsyncStorage'dan geri
 * yüklenir); yalnız ilk ziyarette geçerlidir. Giriş sonrası lab bölgesi de
 * devreye girer (applyLabRegionDefaults) ve o da açık tercihi ezmez.
 *
 * Sıralama:
 *   1. Cihaz dili desteklenen bir dilse onu kullan
 *   2. Değilse saat dilimi Asia/Tehran ise Farsça  ← VPN bunu DEĞİŞTİRMEZ,
 *      IP tabanlı tespitin İran'da güvenilmez olmasının sebebi de bu
 *   3. Hiçbiri değilse Türkçe (ürünün ana pazarı)
 */
function detectInitialLang(): Lang {
  try {
    const tags = (Localization.getLocales?.() ?? []).map((l: { languageCode?: string | null }) => l.languageCode ?? '');
    for (const t of tags) {
      const code = String(t).slice(0, 2).toLowerCase();
      if (isSupported(code)) return code as Lang;
    }
  } catch { /* yoksay */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('Asia/Tehran')) return 'fa';
  } catch { /* yoksay */ }
  return 'tr';
}

const initialLng: Lang = detectInitialLang();

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
// Takvim tercihini geri yükle (dilden bağımsız, async).
AsyncStorage.getItem(CAL_KEY).then((saved) => {
  if (saved === 'auto' || saved === 'gregorian' || saved === 'persian') {
    calendarPref = saved;
    try { (i18n as any).emit?.('languageChanged', i18n.language); } catch { /* yoksay */ }
  }
}).catch(() => { /* sessiz geç */ });

AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (isSupported(saved) && saved !== i18n.language) {
    i18n.changeLanguage(saved);
  }
}).catch(() => { /* sessiz geç */ });

/**
 * Dili değiştir.
 *
 * `explicit` (varsayılan true) = kullanıcı bilinçli olarak seçti. Bu işaret
 * ayrı bir anahtarda tutulur; bölge varsayılanı (İran → Farsça) yalnız işaret
 * YOKKEN devreye girer. Böylece "İran labı Farsça açılır, kullanıcı isterse
 * değiştirir ve o seçim bir daha ezilmez" davranışı elde edilir.
 */
export async function setLanguage(lng: Lang, opts: { explicit?: boolean } = {}): Promise<void> {
  const explicit = opts.explicit !== false;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lng);
    if (explicit) await AsyncStorage.setItem(LANG_EXPLICIT_KEY, '1');
  } catch { /* yoksay */ }
  await i18n.changeLanguage(lng);
}

export default i18n;
