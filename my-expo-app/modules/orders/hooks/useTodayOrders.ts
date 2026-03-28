import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { isOrderOverdue } from '../constants';
import { fetchAllWorkOrders } from '../api';

function sortWorkList(orders: WorkOrder[]): WorkOrder[] {
  return [...orders].sort((a, b) => {
    const aOverdue = isOrderOverdue(a.delivery_date, a.status);
    const bOverdue = isOrderOverdue(b.delivery_date, b.status);

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
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchAllWorkOrders();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      const filtered = filterTodayAndOverdue((data as WorkOrder[]) ?? []);
      setOrders(sortWorkList(filtered));
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
