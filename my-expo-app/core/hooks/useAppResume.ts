import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Uygulama arka plandan ön plana dönünce `onResume`'u çağırır (web + native).
 *
 * Neden: mobil/PWA askıya alınınca realtime websocket kopar ve askıdayken olan
 * değişiklikler kaçar — socket yeniden bağlansa bile ekran bayat kalır. Ön plana
 * dönüşte aktif ekranı yeniden çekmek için kullanılır.
 *
 * Debounce'ludur: visibilitychange + focus + AppState aynı anda tetiklenebilir.
 */
export function useAppResume(onResume: () => void, opts?: { enabled?: boolean; debounceMs?: number }) {
  const enabled = opts?.enabled ?? true;
  const debounceMs = opts?.debounceMs ?? 300;
  const cbRef = useRef(onResume);
  cbRef.current = onResume;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const fire = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { cbRef.current(); }, debounceMs);
    };

    if (Platform.OS !== 'web') {
      const sub = AppState.addEventListener('change', (s) => { if (s === 'active') fire(); });
      return () => { if (timerRef.current) clearTimeout(timerRef.current); sub.remove(); };
    }

    // Web / PWA
    if (typeof document === 'undefined') return;
    const onVis = () => { if (document.visibilityState === 'visible') fire(); };
    document.addEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.addEventListener('focus', fire);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVis);
      if (typeof window !== 'undefined') window.removeEventListener('focus', fire);
    };
  }, [enabled, debounceMs]);
}
