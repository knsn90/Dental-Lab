// core/kiosk/kioskModeStore.ts
// Aktif oturum bir kiosk tabletinden mi açıldı? Senkron erişim için (routing effect'i
// AsyncStorage'ı bekleyemez) zustand + AsyncStorage kalıcılığı. Çıkış/kilit → /kiosk.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kiosk_mode_v1';

interface KioskModeState {
  isKiosk: boolean;
  hydrated: boolean;
  setKiosk: (v: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useKioskMode = create<KioskModeState>((set) => ({
  isKiosk: false,
  hydrated: false,
  setKiosk: (v) => {
    set({ isKiosk: v });
    AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
  },
  hydrate: async () => {
    try { const v = await AsyncStorage.getItem(KEY); set({ isKiosk: v === '1', hydrated: true }); }
    catch { set({ hydrated: true }); }
  },
}));
