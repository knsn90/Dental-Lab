import { useState, useEffect, useCallback } from 'react';
import {
  fetchCashAccounts, fetchMovements, fetchDrawers, fetchUnposted,
  type CashAccount, type CashMovement, type Drawer, type UnpostedRow,
} from '../api';

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

/** Nakit kasalar (çekmeceler) + kasası olmayan nakit uyarısı */
export function useDrawers() {
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [drawerIds, setDrawerIds] = useState<string[]>([]);
  const [unposted, setUnposted] = useState<UnpostedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, u] = await Promise.all([fetchDrawers(), fetchUnposted()]);
    setDrawers(d.data);
    setDrawerIds(d.drawerIds);
    setUnposted(u.error ? [] : u.data);
    setError(d.error ? String((d.error as any)?.message ?? d.error) : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { drawers, drawerIds, unposted, loading, error, refetch: load };
}
