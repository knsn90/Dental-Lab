// core/kiosk/purgeKioskCaches.ts
// Kiosk (ortak tablet) oturumu kilitlenince/çıkınca önceki kullanıcının önbelleğe
// alınmış VERİLERİNİ temizle (KVKK: sonraki kişi öncekinin siparişlerini görmesin).
// Cihaz jetonu, kiosk modu, dil ve tema KORUNUR.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Silinecek (kullanıcıya özel veri) anahtar desenleri. Supabase auth token'ı signOut
// tarafından zaten temizlenir.
const PURGE_SUBSTRINGS = ['cache', 'draft', 'orders_', 'clinic_orders', 'inbox', 'notif', 'lastPanel', 'recent'];
// Korunacaklar (silinmez)
const KEEP_SUBSTRINGS = ['kiosk_device', 'kiosk_lab', 'kiosk_name', 'kiosk_mode', 'app_lang', 'app_calendar', 'color_theme', 'theme_mode'];

function shouldPurge(k: string): boolean {
  const low = k.toLowerCase();
  if (KEEP_SUBSTRINGS.some((s) => low.includes(s.toLowerCase()))) return false;
  return PURGE_SUBSTRINGS.some((s) => low.includes(s.toLowerCase()));
}

export async function purgeKioskCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(shouldPurge);
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch { /* önbellek temizliği best-effort */ }
}
