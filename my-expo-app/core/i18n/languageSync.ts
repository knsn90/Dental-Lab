/**
 * Hesap dili ↔ cihaz dili — saf karar fonksiyonu (I/O yok; languageSync.test.mts).
 *
 * Dil eskiden YALNIZ cihazda (AsyncStorage / localStorage) tutuluyordu: yeni
 * cihaz, PWA ↔ tarayıcı, başka alan adı ya da temizlenmiş site verisinde
 * uygulama cihaz diline (çoğu zaman İngilizce) düşüyordu. Artık seçim
 * `profiles.language`'a da yazılır ve girişte oradan okunur.
 *
 *   profileLang   → profiles.language (NULL = hesapta henüz seçim yok)
 *   localLang     → cihazdaki geçerli dil
 *   localExplicit → cihazda dil kullanıcı tarafından SEÇİLDİ mi (tahmin değil)
 *   pending       → seçim yapıldı ama henüz hesaba yazılamadı (ör. giriş ekranında)
 *
 * Kural: en son bilinçli seçim kazanır. Bekleyen seçim hesaptakini ezer;
 * bekleyen yoksa hesabın dili uygulanır; hesap boşsa cihazdaki bilinçli seçim
 * hesaba taşınır. Cihazdan TAHMİN edilen dil hesaba hiç yazılmaz.
 */

export const SUPPORTED_LANGS = ['tr', 'en', 'de', 'fa'] as const;
export type SyncLang = typeof SUPPORTED_LANGS[number];

export type LanguageSyncDecision =
  | { action: 'apply'; lang: SyncLang }   // hesabın dilini cihaza uygula
  | { action: 'push'; lang: SyncLang }    // cihazdaki seçimi hesaba yaz
  | { action: 'clearPending' }            // zaten aynı — yalnız bekleme işaretini kaldır
  | { action: 'none' };

const valid = (l: unknown): l is SyncLang => (SUPPORTED_LANGS as readonly unknown[]).includes(l);

export function decideLanguageSync(s: {
  profileLang: string | null | undefined;
  localLang: string | null | undefined;
  localExplicit: boolean;
  pending: boolean;
}): LanguageSyncDecision {
  const profile = valid(s.profileLang) ? s.profileLang : null;
  const local = valid(s.localLang) ? s.localLang : null;

  if (s.pending && local) {
    return local === profile ? { action: 'clearPending' } : { action: 'push', lang: local };
  }
  if (profile) {
    return profile === local ? { action: 'none' } : { action: 'apply', lang: profile };
  }
  if (s.localExplicit && local) return { action: 'push', lang: local };
  return { action: 'none' };
}

/**
 * Cihazdaki bilinçli seçim girişi yapan kullanıcıya mı ait? Seçim hesaba
 * yazılınca sahibinin id'si saklanır; ortak tablette (kiosk) bir teknisyenin
 * seçimi bir sonrakinin hesabına taşınmasın. "1" = bu sürümden önceki,
 * sahibi bilinmeyen seçim — tek kullanıcılı cihazlarda taşınması doğru.
 */
export function isOwnExplicitChoice(owner: string | null | undefined, profileId: string): boolean {
  return owner === '1' || (!!owner && owner === profileId);
}
