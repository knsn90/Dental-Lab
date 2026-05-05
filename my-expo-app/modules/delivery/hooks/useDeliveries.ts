// modules/delivery/hooks/useDeliveries.ts
// Lab yöneticisi için teslimat listesi — gerçek zamanlı

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { fetchActiveDeliveries, type Delivery } from '../api';

export function useDeliveries(labId: string | null | undefined) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!labId) return;
    setLoading(true);
    const { data, error: err } = await fetchActiveDeliveries(labId);
    if (err) setError(err.message);
    else     setDeliveries((data ?? []) as unknown as Delivery[]);
    setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  // Gerçek zamanlı
  useEffect(() => {
    if (!labId) return;
    const channel = supabase
      .channel('deliveries_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [labId, load]);

  return { deliveries, loading, error, refresh: load };
}
