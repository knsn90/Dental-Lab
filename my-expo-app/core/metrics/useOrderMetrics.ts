/**
 * useOrderMetrics — Özet, liste çipleri ve diğer ekranların sipariş sayıları.
 *
 * TEK kaynak: `order_metrics()` RPC (20261026100000). Çağıranın yetkisiyle çalışır;
 * teknisyen yalnız kendi işlerini sayar. Listeler en fazla 300 satır çektiği için
 * sayım ekranda YAPILMAZ (spec kararı 10).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../api/supabase';
import { subscribeShared } from '../api/sharedChannel';
import { useAuthStore } from '../store/authStore';
import { useAppResume } from '../hooks/useAppResume';

export type OrderMetrics = {
  today: string;
  active: number;
  overdue: number;
  urgent: number;
  /** Beklemede (prova beklemesi hariç) — orderDefs.isHeldOrder ile aynı kural (20261102110000). */
  on_hold: number;
  due_today: number;
  due_tomorrow: number;
  created_today: number;
  created_this_month: number;
  delivered_today: number;
  by_status: Record<string, number>;
};

function normalize(raw: any): OrderMetrics | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v: any) => Number(v) || 0;
  const by: Record<string, number> = {};
  Object.entries(raw.by_status ?? {}).forEach(([k, v]) => { by[k] = n(v); });
  return {
    today: String(raw.today ?? ''),
    active: n(raw.active),
    overdue: n(raw.overdue),
    urgent: n(raw.urgent),
    on_hold: n(raw.on_hold),
    due_today: n(raw.due_today),
    due_tomorrow: n(raw.due_tomorrow),
    created_today: n(raw.created_today),
    created_this_month: n(raw.created_this_month),
    delivered_today: n(raw.delivered_today),
    by_status: by,
  };
}

/** Aynı anda açık birden çok ekran tek istek atsın. */
let inFlight: Promise<OrderMetrics | null> | null = null;
function fetchMetrics(): Promise<OrderMetrics | null> {
  if (!inFlight) {
    inFlight = (async () => {
      const { data, error } = await supabase.rpc('order_metrics');
      return error ? null : normalize(data);
    })().finally(() => { inFlight = null; });
  }
  return inFlight;
}

export function useOrderMetrics(): { data: OrderMetrics | null; loading: boolean; refetch: () => void } {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [data, setData] = useState<OrderMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const m = await fetchMetrics();
    if (m) setData(m);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    // useOrders ile AYNI paylaşılan kanal (anahtar + bağlamalar) — yeni kanal açılmaz.
    const unsubscribe = subscribeShared(
      `work_orders_realtime:${userId}`,
      [
        { event: '*', schema: 'public', table: 'work_orders' },
        { event: '*', schema: 'public', table: 'order_stages' },
      ],
      () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 400);
      },
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [load, userId]);

  useAppResume(() => { load(); });

  return { data, loading, refetch: load };
}
