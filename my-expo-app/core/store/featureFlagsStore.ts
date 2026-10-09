/**
 * Lab bazlı modül bayrakları (platform panelinden açılıp kapatılır).
 * Kaynak: my_feature_flags() RPC — katalog varsayılanı + lab'a özel ayar.
 *
 * Kullanım:
 *   const on = useFeature('phone_assistant');
 *   Nav öğelerinde: { ..., requiresFeature: 'phone_assistant' } (PatternsShell süzer)
 *
 * Sunucu tarafı ayrıca kontrol eder (RLS / RPC); bu store yalnız arayüzü gizler.
 */
import { create } from 'zustand';
import { myFeatureFlags } from '../../modules/platform/api';

interface FeatureFlagsState {
  flags: Record<string, boolean>;
  loaded: boolean;
  /** Hangi lab için yüklendi (lab değişince yeniden yüklenir). */
  labId: string | null;
  load: (labId: string | null) => Promise<void>;
  reset: () => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>((set, get) => ({
  flags: {},
  loaded: false,
  labId: null,
  load: async (labId) => {
    if (get().loaded && get().labId === labId) return;
    try {
      const flags = await myFeatureFlags();
      set({ flags, loaded: true, labId });
    } catch {
      set({ flags: {}, loaded: true, labId });
    }
  },
  reset: () => set({ flags: {}, loaded: false, labId: null }),
}));

/** Modül açık mı? Yüklenmeden önce false döner (kapalı modül bir an bile görünmesin). */
export function useFeature(key: string): boolean {
  return useFeatureFlagsStore((s) => s.flags[key] === true);
}
