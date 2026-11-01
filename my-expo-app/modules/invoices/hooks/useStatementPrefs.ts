/**
 * Ekstre liste ayarı — kullanıcıya özel, cihazda (AsyncStorage) saklanır.
 * Model ve kurallar: lib/statementPrefs.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STATEMENT_PREFS, parseStatementPrefs, type StatementPrefs } from '../lib/statementPrefs';

const STORAGE_KEY = 'siman_statement_prefs_v1';

interface StatementPrefsState {
  prefs: StatementPrefs;
  hydrated: boolean;
  setPref: (key: keyof StatementPrefs, value: boolean) => void;
  reset: () => void;
  hydrate: () => Promise<void>;
}

export const useStatementPrefsStore = create<StatementPrefsState>((set, get) => ({
  prefs: { ...DEFAULT_STATEMENT_PREFS },
  hydrated: false,
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
  },
  reset: () => {
    set({ prefs: { ...DEFAULT_STATEMENT_PREFS } });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ prefs: parseStatementPrefs(raw), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));

/** Ekranda kullanım: ilk mount'ta kayıtlı tercihi yükler. */
export function useStatementPrefs() {
  const s = useStatementPrefsStore();
  const hydrate = s.hydrate;
  useEffect(() => { void hydrate(); }, [hydrate]);
  return s;
}
