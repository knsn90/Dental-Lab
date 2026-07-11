import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { AppState } from 'react-native';

// Web: use localStorage directly.
// Native: use @react-native-async-storage/async-storage (iOS 26 beta uyumluluğu).
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

// Native storage adapter.
//
// ÖNEMLİ: Önceden expo-secure-store kullanıyorduk; iOS 26.4 beta'da
// expo-secure-store'un Swift async function'ı `tryDynamicCastNSErrorObjectToValue`
// içinde patlıyor → TurboModule queue'da Obj-C exception → app cold-start'ta abort.
// Çözüm: AsyncStorage'a geçtik. Eski arch native modül, Expo Modules Swift sistemi
// dışında çalışır, iOS 26 beta sorunlarından etkilenmez. Token keychain yerine
// uygulamanın private sandbox'ında saklanır (iOS sandbox + Data Protection ile
// zaten encrypted-at-rest).
const nativeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const storageAdapter = Platform.OS === 'web' ? webStorageAdapter : nativeStorageAdapter;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ── Defensive guard: ölü/yanlış Supabase URL'ine bağlanma ────────────────────
//
// Bu liste eskiden kullanılmış ama artık var olmayan proje ref'leridir.
// .env / build env'inde yanlışlıkla geri sızarlarsa loud crash atıp browser
// konsoluna açık talimat veriyoruz. Sessiz "Sunucuya bağlanılamadı" yerine
// yöneticinin uyanması için bilinçli regression koruması.
const DEAD_SUPABASE_REFS = ['fukaxeppklvtegnjuwih'];
{
  const matchedDead = DEAD_SUPABASE_REFS.find(ref => (supabaseUrl ?? '').includes(ref));
  if (matchedDead) {
    const msg =
      `[supabase] ÖLÜ proje URL'i tespit edildi: "${matchedDead}". ` +
      `EXPO_PUBLIC_SUPABASE_URL şu olmalı: https://kjwjxqfdsxkxgcgophdy.supabase.co . ` +
      `Build cache'ini temizleyip yeniden deploy edin (Vercel env vars + my-expo-app/.env). ` +
      `Browser cache hard refresh: Cmd/Ctrl+Shift+R.`;
    if (typeof console !== 'undefined' && console.error) console.error(msg);
    if (typeof window !== 'undefined') {
      // Sayfanın üstüne kırmızı uyarı bandı yapıştır — kullanıcı boş ekran sanmasın
      try {
        const bar = (window.document?.createElement?.('div') ?? null) as HTMLDivElement | null;
        if (bar && window.document?.body) {
          bar.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7F1D1D;color:#fff;' +
            'padding:14px 20px;font:600 13px system-ui;text-align:center;line-height:1.5';
          bar.textContent =
            'Uygulama yanlış Supabase projesine bağlı (eski URL). Lütfen tarayıcıyı hard refresh ' +
            '(Cmd/Ctrl+Shift+R) yapın. Sorun devam ederse yöneticiye bildirin.';
          window.document.body.appendChild(bar);
        }
      } catch { /* SSR / no DOM */ }
    }
    throw new Error(msg);
  }
}

// Boş/eksik URL/key kontrolü — sessiz başarısızlık yerine açık hata
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL veya EXPO_PUBLIC_SUPABASE_ANON_KEY eksik. ' +
    'my-expo-app/.env veya Vercel env vars doğru ayarlandı mı?',
  );
}

// In-process lock — birden fazla tab açıkken Supabase'in default `navigator.locks`
// "steal" davranışı "Lock broken by another request" hatası fırlatıyor. Bunun
// yerine her tab kendi async kuyruğunu kullansın (token refresh'i bağımsız çalıştırır).
let lockQueue: Promise<any> = Promise.resolve();
const inProcessLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const prev = lockQueue;
  let resolveCurrent!: () => void;
  const current = new Promise<void>(r => { resolveCurrent = r; });
  lockQueue = current;
  try {
    await prev;
    return await fn();
  } finally {
    resolveCurrent();
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: inProcessLock,
  },
});

// ── Realtime channel uniqueness patch ─────────────────────────────────────
//
// PROBLEM: Supabase Realtime kanal isimleri client'ta singleton'dır. İki
// component aynı isimle `supabase.channel('foo')` çağırırsa ikinci çağrı
// ilk kanalı (subscribed) bulup `.on('postgres_changes', …)`'a izin vermiyor:
//   "cannot add `postgres_changes` callbacks for realtime:foo after `subscribe()`"
// Bu exception React render tree'sini çökertip beyaz/kırmızı ekrana yol açıyor.
// Projede 30+ farklı .channel() çağrısı var; bazıları sabit isimli, bazıları
// userId tabanlı (yine collision olabilir — aynı user iki ekrandan açarsa).
//
// ÇÖZÜM: client'ın `channel` metodunu wrap edip her çağrıda otomatik unique
// suffix ekle. Eski koda dokunmadan, global olarak fix.
{
  const originalChannel = supabase.channel.bind(supabase);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).channel = (name: string, opts?: any) => {
    const uniq = `${name}__${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return originalChannel(uniq, opts);
  };
}

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
