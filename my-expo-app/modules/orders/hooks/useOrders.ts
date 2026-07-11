import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { fetchWorkOrdersForDoctor, fetchAllWorkOrders } from '../api';

const LS_PREFIX = 'orders_cache_v1';
function cacheKey(userType: string, doctorId?: string, includeArchived?: boolean): string {
  return `${LS_PREFIX}:${userType}:${doctorId ?? 'all'}:${includeArchived ? 'arc' : 'live'}`;
}
function loadCached(key: string): WorkOrder[] | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCached(key: string, rows: WorkOrder[]) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota */ }
}

export function useOrders(userType: 'doctor' | 'lab', doctorId?: string, opts?: { includeArchived?: boolean }) {
  const includeArchived = !!opts?.includeArchived;
  const ckey = cacheKey(userType, doctorId, includeArchived);
  const [orders, setOrders] = useState<WorkOrder[]>(() => loadCached(ckey) ?? []);
  const [loading, setLoading] = useState(() => loadCached(ckey) === null);
  const [error, setError] = useState<string | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const result =
      userType === 'doctor' && doctorId
        ? await fetchWorkOrdersForDoctor(doctorId)
        : await fetchAllWorkOrders({ includeArchived });

    if (result.error) {
      setError(result.error.message);
    } else {
      const rows = (result.data as WorkOrder[]) ?? [];
      setOrders(rows);
      saveCached(ckey, rows);
    }
    if (!silent) setLoading(false);
  }, [userType, doctorId, includeArchived, ckey]);

  // Realtime burst'lerini debounce et — birden fazla stage update'i tek refetch'e düşer.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { load(true); }, 400);
  }, [load]);

  useEffect(() => {
    // Cache varsa silent yükle — spinner gösterme, eski veriyi gör ve arka planda
    // yenile. Cache yoksa normal loading akışı.
    load(loadCached(ckey) !== null);

    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setOrders((prev) => {
              const next = prev.filter((o) => o.id !== payload.old.id);
              saveCached(ckey, next);
              return next;
            });
          } else {
            // INSERT/UPDATE → silent debounced refetch (join'leri yenile, spinner gösterme)
            scheduleRefetch();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages' },
        () => scheduleRefetch(),
      )
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [load, scheduleRefetch]);

  return { orders, loading, error, refetch: load };
}
