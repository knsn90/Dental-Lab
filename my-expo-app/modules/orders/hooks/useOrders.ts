import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { fetchWorkOrdersForDoctor, fetchAllWorkOrders } from '../api';
import { useAuthStore } from '../../../core/store/authStore';

export function useOrders(userType: 'doctor' | 'lab', doctorId?: string) {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const labId = useAuthStore((s) => s.profile?.lab_id);

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
    // kaybolmasın.
    // lab_id filtresi: sadece bu lab'ın değişikliklerini dinle, diğer labların
    // broadcast'i bu istemciye gelmesin (1000 kullanıcıda önemli).
    const workOrderFilter = userType === 'lab' && labId
      ? { event: '*' as const, schema: 'public', table: 'work_orders', filter: `lab_id=eq.${labId}` }
      : { event: '*' as const, schema: 'public', table: 'work_orders' };

    const channelName = userType === 'lab' && labId
      ? `work_orders_${labId}`
      : 'work_orders_realtime';

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', workOrderFilter, (payload) => {
        if (payload.eventType === 'DELETE') {
          setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
        } else {
          load();
        }
      })
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
  }, [load, labId, userType]);

  return { orders, loading, error, refetch: load };
}
