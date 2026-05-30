import { useEffect, useState, useCallback } from 'react';
import { WorkOrder } from '../types';
import { isOrderOverdue } from '../constants';
import { fetchTodayAndOverdueOrders } from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { useLabWorkOrdersRealtime } from './useLabWorkOrdersRealtime';

function sortWorkList(orders: WorkOrder[]): WorkOrder[] {
  return [...orders].sort((a, b) => {
    const aOverdue = isOrderOverdue(a.delivery_date, a.status);
    const bOverdue = isOrderOverdue(b.delivery_date, b.status);

    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;

    return new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
  });
}

export function useTodayOrders() {
  const labId = useAuthStore((s) => s.profile?.lab_id);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchTodayAndOverdueOrders();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setOrders(sortWorkList((data as WorkOrder[]) ?? []));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Shared registry channel — lab_id filtered, no extra subscription
  useLabWorkOrdersRealtime(labId, { onWorkOrders: load });

  return { orders, loading, error, refetch: load };
}
