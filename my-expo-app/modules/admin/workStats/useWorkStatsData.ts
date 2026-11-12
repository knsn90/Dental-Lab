import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { useRealtimeRefresh } from '../../../core/hooks/useRealtimeRefresh';
import { fetchWorkStatsRefs, fetchWorkStatsWindow, type Refs } from './api';
import type { RawOrder } from './aggregate';
import { isLiveWindow, monthKeyOf, type MonthKey } from './months';

export type WorkStatsData = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  orders: RawOrder[];
  refs: Refs | null;
  reload(): void;
};

const ERR = 'İstatistik yüklenemedi';
// Modül içi önbellek (stale-while-revalidate): aynı lab+ay'a dönüşte veri anında gösterilir.
// Geçmiş-ay pencereleri önbellekte kalır; içinde bulunulan ayı içeren pencere (ve refs)
// mount'ta, ekrana odaklanınca ve canlı değişiklikte arkadan sessizce tazelenir —
// Admin Özet kartı (useRealtimeRefresh) ile sayfa aynı sayıyı gösterir.
const windowCache = new Map<string, { orders: RawOrder[]; at: number }>();
const refsCache = new Map<string, { refs: Refs; at: number }>();
// Odak tazelemesi: ilk açılış/yeni çekimden hemen sonra çift sorgu atmaz.
const FOCUS_MIN_AGE_MS = 5000;

const isLive = (k: MonthKey) => isLiveWindow(k, monthKeyOf(new Date()));

export function useWorkStatsData(selected: MonthKey): WorkStatsData {
  const labId = useAuthStore((s) => s.profile?.lab_id) as string | undefined;
  const [state, setState] = useState<Omit<WorkStatsData, 'reload'>>({
    status: 'loading', error: null, orders: [], refs: null,
  });
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  const [reval, setReval] = useState(0);
  const bypass = useRef(false);
  const inflight = useRef(false);
  const selRef = useRef(selected);
  selRef.current = selected;

  useEffect(() => {
    const my = ++seq.current;
    if (!labId) {
      setState({ status: 'error', error: ERR, orders: [], refs: null });
      return;
    }
    const key = `${labId}|${selected}`;
    const force = bypass.current;
    bypass.current = false;
    if (force) { windowCache.delete(key); refsCache.delete(labId); }
    const cw = windowCache.get(key);
    const cr = refsCache.get(labId);
    const live = isLive(selected);
    const silent = !!(cw && cr);
    if (cw && cr) {
      // Önbellekten anında; aynı veriyse yeniden çizme.
      setState((p) => (p.status === 'ready' && p.orders === cw.orders && p.refs === cr.refs
        ? p : { status: 'ready', error: null, orders: cw.orders, refs: cr.refs }));
      if (!live) return;
    } else {
      setState((p) => ({ ...p, status: 'loading', error: null }));
    }
    inflight.current = true;
    (async () => {
      try {
        const [orders, refs] = await Promise.all([
          !cw || live ? fetchWorkStatsWindow(labId, selected) : cw.orders,
          !cr || live ? fetchWorkStatsRefs(labId) : cr.refs,
        ]);
        const now = Date.now();
        // Eski (geride kalmış) bir çekim yeni sonucu ezmesin; boş anahtarı yine doldurur.
        if (my === seq.current || !windowCache.has(key)) windowCache.set(key, { orders, at: now });
        if (my === seq.current || !refsCache.has(labId)) refsCache.set(labId, { refs, at: now });
        if (my !== seq.current) return;
        setState({ status: 'ready', error: null, orders, refs });
      } catch {
        if (my !== seq.current) return;
        // Sessiz tazeleme hatası: eldeki veri kalır (bir sonraki odak/olay yeniden dener).
        if (!silent) setState((p) => ({ ...p, status: 'error', error: ERR }));
      } finally {
        if (my === seq.current) inflight.current = false;
      }
    })();
  }, [labId, selected, tick, reval]);

  const revalidate = useCallback(() => setReval((r) => r + 1), []);

  // Admin düzeni Tabs → ekran mount'lu kalır; geri dönüşte canlı pencereyi tazele.
  useFocusEffect(useCallback(() => {
    if (!labId || inflight.current) return;
    const sel = selRef.current;
    if (!isLive(sel)) return;
    const e = windowCache.get(`${labId}|${sel}`);
    if (!e || Date.now() - e.at < FOCUS_MIN_AGE_MS) return;
    revalidate();
  }, [labId, revalidate]));

  // Kartla aynı canlı sinyal (work_orders) + uygulama ön plana dönüşü (useAppResume).
  useRealtimeRefresh('work_stats_rt', ['work_orders'], revalidate, {
    enabled: !!labId && isLive(selected), debounceMs: 1500,
  });

  const reload = useCallback(() => { bypass.current = true; setTick((t) => t + 1); }, []);
  return { ...state, reload };
}
