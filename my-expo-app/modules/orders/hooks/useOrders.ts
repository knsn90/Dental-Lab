import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { fetchWorkOrdersForDoctor, fetchAllWorkOrders } from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { useLabWorkOrdersRealtime } from './useLabWorkOrdersRealtime';

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

  useEffect(() => { load(); }, [load]);

  // Lab users: shared registry channel (lab_id filtered, includes order_stages)
  useLabWorkOrdersRealtime(
    userType === 'lab' ? labId : null,
    { onWorkOrders: load, onOrderStages: load },
  );

  // Doctor users: own channel filtered by doctor_id
  const doctorChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (userType !== 'doctor' || !doctorId) return;
    const ch = supabase
      .channel(`work_orders_doctor_${doctorId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `doctor_id=eq.${doctorId}` },
        () => load(),
      )
      .subscribe();
    doctorChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); doctorChannelRef.current = null; };
  }, [userType, doctorId, load]);

  return { orders, loading, error, refetch: load };
}
