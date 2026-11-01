/**
 * Dil tercihini HESABA bağlar (profiles.language).
 *
 * Eskiden dil yalnız cihazda tutuluyordu; yeni cihaz / PWA / başka alan adı /
 * temizlenen site verisinde uygulama cihaz diline (çoğu zaman İngilizce)
 * düşüyordu. Şimdi:
 *   • Bilinçli seçim (setLanguage) oturum açıksa hemen hesaba yazılır;
 *     yazılamazsa (çevrimdışı, giriş ekranı) "bekliyor" işaretiyle kalır.
 *   • Girişte profil gelince syncAccountLanguage karar verir
 *     (core/i18n/languageSync.ts → decideLanguageSync).
 *
 * Hesaba yazma başarısız olursa uygulama cihazdaki seçimle bugünkü gibi
 * devam eder; hiçbir hata kullanıcıyı engellemez.
 */
import { supabase } from '../api/supabase';
import {
  setLanguage, registerExplicitLanguageListener, readLanguageSyncState, markLanguageSynced, type Lang,
} from './index';
import { decideLanguageSync, isOwnExplicitChoice } from './languageSync';

async function writeAccountLanguage(userId: string, lang: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('profiles').update({ language: lang }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

// Oturum açıkken yapılan seçim hemen hesaba yazılır.
registerExplicitLanguageListener((lng) => {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return; // giriş ekranı: bekliyor kalır, girişte yazılır
      if (await writeAccountLanguage(uid, lng)) await markLanguageSynced(uid);
    } catch { /* bekliyor kalır */ }
  })();
});

/** Girişte (profil geldiğinde) çağrılır. */
export async function syncAccountLanguage(profile: { id: string; language?: string | null }): Promise<void> {
  try {
    const st = await readLanguageSyncState();
    const d = decideLanguageSync({
      profileLang: profile.language,
      localLang: st.lang,
      localExplicit: isOwnExplicitChoice(st.explicitOwner, profile.id),
      pending: st.pending,
    });
    if (d.action === 'apply') {
      await setLanguage(d.lang as Lang, { fromAccount: true, ownerId: profile.id });
    } else if (d.action === 'push') {
      if (await writeAccountLanguage(profile.id, d.lang)) await markLanguageSynced(profile.id);
    } else if (d.action === 'clearPending') {
      await markLanguageSynced(profile.id);
    }
  } catch { /* cihazdaki dil geçerli kalır */ }
}
