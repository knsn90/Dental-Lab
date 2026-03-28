import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { CaseStep } from '../types';
import { fetchCaseSteps } from '../api';

export function useCaseSteps(workOrderId: string) {
  const [steps, setSteps]     = useState<CaseStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCaseSteps(workOrderId);
      setSteps(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`case_steps_${workOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_steps', filter: `work_order_id=eq.${workOrderId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workOrderId, load]);

  return { steps, loading, error, refetch: load };
}
