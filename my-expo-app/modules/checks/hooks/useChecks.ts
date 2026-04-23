import { useState, useEffect, useCallback } from 'react';
import { fetchChecks, type Check, type CheckStatus } from '../api';

export function useChecks(status?: CheckStatus) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchChecks(status);
    setChecks(data ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return { checks, loading, refetch: load };
}
