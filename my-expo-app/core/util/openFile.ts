/**
 * Cross-platform dosya/URL açma.
 *
 * Web'de window.open (yeni sekme). Native'de RN'de `window` TANIMLI ama
 * `window.open` YOK → `typeof window !== 'undefined' ? window.open(...)` deseni
 * native'de "window.open is not a function" ile çöker. Bu helper platforma göre
 * doğru yolu seçer: native → Linking.openURL (Safari/varsayılan uygulama).
 *
 *   openFileUrl(signedUrl);
 */
import { Linking, Platform } from 'react-native';

export async function openFileUrl(url?: string | null): Promise<void> {
  if (!url) return;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
    }
    return;
  }
  try {
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else await Linking.openURL(url); // http(s) her zaman açılabilir; yine de dene
  } catch (e: any) {
    console.warn('[openFileUrl] açılamadı:', e?.message ?? e);
  }
}
