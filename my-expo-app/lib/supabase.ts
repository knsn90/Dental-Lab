import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { AppState } from 'react-native';

// Web: use localStorage directly.
// Native: use expo-secure-store (imported here — Metro will tree-shake via Platform.OS).
const webStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(
      typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    ),
  setItem: (key: string, value: string): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return Promise.resolve();
  },
};

// On native, expo-secure-store is imported; on web, it's never called.
// We wrap in try/catch to be safe during hot-reload transitions.
const nativeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SecureStore = require('expo-secure-store');
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

const storageAdapter = Platform.OS === 'web' ? webStorageAdapter : nativeStorageAdapter;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh token when app comes back to foreground (native only)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
