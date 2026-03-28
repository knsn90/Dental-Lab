import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { fetchWorkOrdersForDoctor, fetchAllWorkOrders } from '../api';

export function useOrders(userType: 'doctor' | 'lab', doctorId?: string) {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result =
      userType === 'doctor' && doctorId
        ? await fetchWorkOrdersForDoctor(doctorId)
        : await fetchAllWorkOrders();

    if (result.error) {
      setError(result.error.message);
    } else {
      setOrders((result.data as WorkOrder[]) ?? []);
    }
    setLoading(false);
  }, [userType, doctorId]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new as WorkOrder, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev.map((o) => (o.id === payload.new.id ? (payload.new as WorkOrder) : o))
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { orders, loading, error, refetch: load };
}
