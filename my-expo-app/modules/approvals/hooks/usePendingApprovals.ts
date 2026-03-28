import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { Approval } from '../types';
import { fetchPendingApprovals } from '../api';

export function usePendingApprovals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingApprovals();
      setApprovals(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pending_approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { approvals, loading, error, refetch: load };
}
