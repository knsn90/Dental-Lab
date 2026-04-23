import { useState, useEffect, useCallback } from 'react';
import {
  fetchPerformanceList, fetchPerformance, fetchBonuses,
  calculatePerformance, calculateBonuses, lockPerformance,
  currentPeriod,
  type EmployeePerformance, type PerformanceBonus,
} from '../api';

// ─── Dönem listesi ────────────────────────────────────────────────────────────
export function usePerformanceList(period: string) {
  const [list, setList]       = useState<EmployeePerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchPerformanceList(period);
    setList((data as EmployeePerformance[]) ?? []);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return { list, loading, refetch: load };
}

// ─── Tek çalışan performans detayı ───────────────────────────────────────────
export function usePerformanceDetail(employeeId: string | null, period: string) {
  const [perf, setPerf]         = useState<EmployeePerformance | null>(null);
  const [bonuses, setBonuses]   = useState<PerformanceBonus[]>([]);
  const [loading, setLoading]   = useState(false);
  const [calcLoading, setCalc]  = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) { setPerf(null); setBonuses([]); return; }
    setLoading(true);
    const { data: p } = await fetchPerformance(employeeId, period);
    setPerf(p ?? null);
    if (p?.id) {
      const { data: b } = await fetchBonuses(p.id);
      setBonuses((b as PerformanceBonus[]) ?? []);
    } else {
      setBonuses([]);
    }
    setLoading(false);
  }, [employeeId, period]);

  useEffect(() => { load(); }, [load]);

  const calculate = useCallback(async () => {
    if (!employeeId) return;
    setCalc(true);
    await calculatePerformance(employeeId, period);
    await load();
    setCalc(false);
  }, [employeeId, period, load]);

  const recalcBonuses = useCallback(async () => {
    if (!perf?.id) return;
    setCalc(true);
    await calculateBonuses(perf.id);
    await load();
    setCalc(false);
  }, [perf?.id, load]);

  const lock = useCallback(async () => {
    if (!perf?.id) return;
    await lockPerformance(perf.id);
    await load();
  }, [perf?.id, load]);

  return {
    perf, bonuses, loading, calcLoading,
    refetch: load, calculate, recalcBonuses, lock,
  };
}
