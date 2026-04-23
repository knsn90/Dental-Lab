import { useState, useEffect, useCallback } from 'react';
import {
  fetchSgkEmployees, fetchBildirge, fetchLabSgk,
  fetchPayrollForSgk, fetchKumulatifGvMatrah,
  type SgkEmployee, type SgkBildirge, type LabSgk,
} from '../api';

export function useSgkEmployees() {
  const [employees, setEmployees] = useState<SgkEmployee[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchSgkEmployees();
    setEmployees(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { employees, loading, refetch: load };
}

export function useBildirge(employeeId: string | null) {
  const [bildirge, setBildirge] = useState<SgkBildirge[]>([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await fetchBildirge(employeeId);
    setBildirge(data ?? []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);
  return { bildirge, loading, refetch: load };
}

export function useLabSgk() {
  const [lab, setLab]         = useState<LabSgk | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchLabSgk();
    setLab(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { lab, loading, refetch: load };
}

export function useSgkPrimRaporu(period: string) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchPayrollForSgk(period);
    setRows(data ?? []);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);
  return { rows, loading, refetch: load };
}
