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

    // Realtime payload'ı sadece work_orders kolonlarını taşır; current_stage_name
    // gibi join'li alanlar düşer. UPDATE/INSERT'te tam refetch et — stage_name
    // kaybolmasın. (Liste boyutu büyük değil, performans yeterli.)
    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          } else {
            // INSERT veya UPDATE → tam refetch (join'leri yenile)
            load();
          }
        }
      )
      // Stage değişimleri de Kanban kolonunu etkiler
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages' },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { orders, loading, error, refetch: load };
}
