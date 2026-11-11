import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchWorkStatsRefs, fetchWorkStatsWindow, type Refs } from './api';
import type { RawOrder } from './aggregate';
import type { MonthKey } from './months';

export type WorkStatsData = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  orders: RawOrder[];
  refs: Refs | null;
  reload(): void;
};

const ERR = 'İstatistik yüklenemedi';
// Modül içi önbellek: aynı lab+ay'a dönüşte sorgu yok.
const windowCache = new Map<string, RawOrder[]>();
const refsCache = new Map<string, Refs>();

export function useWorkStatsData(selected: MonthKey): WorkStatsData {
  const labId = useAuthStore((s) => s.profile?.lab_id) as string | undefined;
  const [state, setState] = useState<Omit<WorkStatsData, 'reload'>>({
    status: 'loading', error: null, orders: [], refs: null,
  });
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  const bypass = useRef(false);

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
    const cachedOrders = windowCache.get(key);
    const cachedRefs = refsCache.get(labId);
    if (cachedOrders && cachedRefs) {
      setState({ status: 'ready', error: null, orders: cachedOrders, refs: cachedRefs });
      return;
    }
    setState((p) => ({ ...p, status: 'loading', error: null }));
    (async () => {
      try {
        const [orders, refs] = await Promise.all([
          cachedOrders ?? fetchWorkStatsWindow(labId, selected),
          cachedRefs ?? fetchWorkStatsRefs(labId),
        ]);
        windowCache.set(key, orders);
        refsCache.set(labId, refs);
        if (my !== seq.current) return;
        setState({ status: 'ready', error: null, orders, refs });
      } catch {
        if (my !== seq.current) return;
        setState((p) => ({ ...p, status: 'error', error: ERR }));
      }
    })();
  }, [labId, selected, tick]);

  const reload = useCallback(() => { bypass.current = true; setTick((t) => t + 1); }, []);
  return { ...state, reload };
}
