// Shared Realtime registry for lab-panel hooks that all listen to
// work_orders (filtered by lab_id) and order_stages.
//
// Problem: useOrders + usePendingActionCount + useTodayOrders each created
// their own channel, multiplying server-side subscriptions. Worse, the
// latter two had NO lab_id filter — they received callbacks for every
// lab's changes.
//
// Solution: one channel per lab_id, ref-counted. Multiple hooks attach
// listeners to the same Supabase channel via this registry.

import { useEffect, useRef } from 'react';
import { supabase } from '../../../core/api/supabase';

type Listener = () => void;

interface Entry {
  refCount: number;
  channel: ReturnType<typeof supabase.channel>;
  onWorkOrders: Set<Listener>;
  onOrderStages: Set<Listener>;
}

const registry = new Map<string, Entry>();

function acquire(labId: string): Entry {
  let entry = registry.get(labId);
  if (!entry) {
    const channel = supabase
      .channel(`lab_work_orders_${labId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `lab_id=eq.${labId}` },
        () => { entry!.onWorkOrders.forEach(fn => fn()); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages' },
        () => { entry!.onOrderStages.forEach(fn => fn()); },
      )
      .subscribe();

    entry = { refCount: 0, channel, onWorkOrders: new Set(), onOrderStages: new Set() };
    registry.set(labId, entry);
  }
  entry.refCount++;
  return entry;
}

function release(labId: string) {
  const entry = registry.get(labId);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount === 0) {
    supabase.removeChannel(entry.channel);
    registry.delete(labId);
  }
}

export interface LabWorkOrdersListeners {
  onWorkOrders?: Listener;
  onOrderStages?: Listener;
}

export function useLabWorkOrdersRealtime(
  labId: string | null | undefined,
  listeners: LabWorkOrdersListeners,
) {
  const ref = useRef(listeners);
  ref.current = listeners;

  useEffect(() => {
    if (!labId) return;
    const entry = acquire(labId);

    const woHandler = () => ref.current.onWorkOrders?.();
    const osHandler = () => ref.current.onOrderStages?.();

    if (listeners.onWorkOrders)  entry.onWorkOrders.add(woHandler);
    if (listeners.onOrderStages) entry.onOrderStages.add(osHandler);

    return () => {
      entry.onWorkOrders.delete(woHandler);
      entry.onOrderStages.delete(osHandler);
      release(labId);
    };
    // labId değişirse yeni kanala bağlan — listeners değişimi ref ile ele alınır
  }, [labId]); // eslint-disable-line react-hooks/exhaustive-deps
}
