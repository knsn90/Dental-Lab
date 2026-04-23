import { useState, useEffect, useCallback } from 'react';
import { fetchCashAccounts, fetchMovements, type CashAccount, type CashMovement } from '../api';

export function useCashAccounts() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchCashAccounts();
    setAccounts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { accounts, loading, refetch: load };
}

export function useMovements(accountId: string | null) {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) { setMovements([]); return; }
    setLoading(true);
    const { data } = await fetchMovements(accountId);
    setMovements(data ?? []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  return { movements, loading, refetch: load };
}
