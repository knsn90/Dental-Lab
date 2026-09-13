// core/kiosk/useKioskIdleLock.ts
// Kiosk oturumunda 10 dk hareketsizlik → önbellek temizle + signOut → /kiosk.
// Yalnız oturum açıkken VE tablet kiosk modundayken çalışır. (Web'de aktivite
// dinleyicileri; native'de zamanlayıcı.)
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useKioskMode } from './kioskModeStore';
import { purgeKioskCaches } from './purgeKioskCaches';

const IDLE_MS = 10 * 60 * 1000; // 10 dakika

export function useKioskIdleLock(hasSession: boolean) {
  const isKiosk = useKioskMode((s) => s.isKiosk);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasSession || !isKiosk) return;

    const lock = async () => {
      try { await purgeKioskCaches(); } catch { /* best-effort */ }
      try { await supabase.auth.signOut(); } catch { /* best-effort */ }
      // isKiosk KORUNUR → routing !session'da /kiosk'a döner (bkz. app/_layout.tsx)
    };
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, IDLE_MS);
    };
    reset();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
      events.forEach((e) => window.addEventListener(e, reset, { passive: true } as any));
      return () => {
        if (timer.current) clearTimeout(timer.current);
        events.forEach((e) => window.removeEventListener(e, reset));
      };
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [hasSession, isKiosk]);
}
