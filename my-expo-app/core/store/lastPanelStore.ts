/**
 * lastPanelStore — kullanıcının son girdiği panel (optimistic ilk-açılış routing).
 *
 * Profil gelmeden önce index.tsx bu değere bakıp son panele ANINDA yönlendirir
 * (boş splash yerine kabuk hemen görünür). Profil gelince yanlışsa panel
 * layout'ları kendini düzeltir ('/'ya yönlendirir → doğru panel).
 *
 * AsyncStorage cross-platform'dur (web'de localStorage'a düşer) → tek yol.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nx_last_panel';

export type PanelKey = 'lab' | 'exec' | 'klinik' | 'doctor' | 'teknisyen';
const VALID: PanelKey[] = ['lab', 'exec', 'klinik', 'doctor', 'teknisyen'];

/** PanelKey → expo-router grup rotası */
export const PANEL_ROUTE: Record<PanelKey, string> = {
  lab: '/(lab)',
  exec: '/(admin)',
  klinik: '/(clinic)',
  doctor: '/(doctor)',
  teknisyen: '/(station)',
};

interface LastPanelState {
  panel: PanelKey | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPanel: (p: PanelKey) => void;
  /** Çıkışta çağrılır — bir sonraki (farklı hesap) girişinde bayat panele
   *  optimistik yönlendirmeyi ve onu izleyen self-heal döngüsünü önler. */
  clear: () => void;
}

export const useLastPanelStore = create<LastPanelState>((set) => ({
  panel: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      set({
        panel: stored && VALID.includes(stored as PanelKey) ? (stored as PanelKey) : null,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  setPanel: (p) => {
    set({ panel: p });
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  },
  clear: () => {
    set({ panel: null });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
}));
