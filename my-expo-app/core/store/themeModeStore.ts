/**
 * Theme mode store — light / dark / system.
 * Persisted via AsyncStorage. Default: 'light'.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeModeState {
  mode: ThemeMode;
  /** Effective dark flag — resolved from system when mode === 'system' */
  resolvedDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  hydrate: () => Promise<void>;
}

const STORAGE_KEY = 'dental_app_theme_mode_v1';

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

export const useThemeModeStore = create<ThemeModeState>((set, get) => ({
  mode: 'light',
  resolvedDark: false,

  setMode: (mode) => {
    const resolvedDark = resolveDark(mode);
    set({ mode, resolvedDark });
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  },

  toggle: () => {
    const next: ThemeMode = get().resolvedDark ? 'light' : 'dark';
    get().setMode(next);
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        set({ mode: stored, resolvedDark: resolveDark(stored) });
      }
    } catch {
      // ignore
    }
  },
}));

// Re-evaluate on system color scheme change (only matters for mode='system')
Appearance.addChangeListener(() => {
  const { mode, setMode } = useThemeModeStore.getState();
  if (mode === 'system') setMode('system'); // recalc
});
