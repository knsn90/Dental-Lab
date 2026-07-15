import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { isOrderOverdue } from '../constants';
import { fetchAllWorkOrders } from '../api';

// Stale-while-revalidate cache — mobil dashboard navigasyon sonrası anında render eder
const CACHE_KEY = 'today_orders_cache_v1';

function readCache(): WorkOrder[] | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return null;
    // 1 saat TTL — daha eski cache'i atla
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > 60 * 60 * 1000) return null;
    return parsed.items as WorkOrder[];
  } catch { return null; }
}

function writeCache(items: WorkOrder[]) {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* quota / disabled */ }
}

function sortWorkList(orders: WorkOrder[]): WorkOrder[] {
  return [...orders].sort((a, b) => {
    const aOverdue = isOrderOverdue(a.delivery_date, a.status, (a as any).hold_status);
    const bOverdue = isOrderOverdue(b.delivery_date, b.status, (b as any).hold_status);

    // Overdue items first
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;

    // Then sort by delivery date ascending
    return new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
  });
}

function filterTodayAndOverdue(orders: WorkOrder[]): WorkOrder[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return orders.filter(
    (o) => o.status !== 'teslim_edildi' && new Date(o.delivery_date) <= today
  );
}

export function useTodayOrders() {
  // İlk render → cache varsa anında dolu, yoksa boş + loading
  const cached = typeof window !== 'undefined' ? readCache() : null;
  const [orders, setOrders] = useState<WorkOrder[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Cache yoksa spinner göster; varsa sessiz arka plan refresh
    if (!readCache()) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchAllWorkOrders();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      const filtered = filterTodayAndOverdue((data as WorkOrder[]) ?? []);
      const sorted = sortWorkList(filtered);
      setOrders(sorted);
      writeCache(sorted);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('today_work_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { orders, loading, error, refetch: load };
}
