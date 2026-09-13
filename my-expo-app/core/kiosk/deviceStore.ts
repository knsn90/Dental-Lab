// core/kiosk/deviceStore.ts
// Kiosk (tablet) cihaz jetonu + meta deposu. Ham cihaz jetonu YALNIZ tablette burada
// saklanır (sunucuda yalnız SHA-256'sı var). AsyncStorage web'de localStorage'a iner.
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOT: kiosk-mode bayrağı ayrı bir store'da (core/kiosk/kioskModeStore.ts) — routing
// effect'i senkron okuyabilsin diye. Burası yalnız cihaz jetonu + meta.
const TOKEN_KEY = 'kiosk_device_token_v1';
const NAME_KEY  = 'kiosk_device_name_v1';
const LAB_KEY   = 'kiosk_lab_name_v1';

export interface KioskDevice { token: string; deviceName: string; labName: string; }

export async function getKioskDevice(): Promise<KioskDevice | null> {
  try {
    const [token, deviceName, labName] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(NAME_KEY),
      AsyncStorage.getItem(LAB_KEY),
    ]);
    if (!token) return null;
    return { token, deviceName: deviceName ?? '', labName: labName ?? '' };
  } catch { return null; }
}

export async function saveKioskDevice(d: KioskDevice): Promise<void> {
  try {
    await AsyncStorage.multiSet([[TOKEN_KEY, d.token], [NAME_KEY, d.deviceName], [LAB_KEY, d.labName]]);
  } catch { /* yoksay */ }
}

/** Cihazı bu tabletten kaldır (eşleştirmeyi çöz). */
export async function clearKioskDevice(): Promise<void> {
  try { await AsyncStorage.multiRemove([TOKEN_KEY, NAME_KEY, LAB_KEY]); } catch { /* yoksay */ }
}
