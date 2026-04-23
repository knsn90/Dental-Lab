import { useState, useEffect, useCallback } from 'react';
import {
  fetchLeaveSummaries, fetchLeaves, fetchPendingLeaves,
  fetchAttendance, fetchMonthlyAttendanceSummary,
  type LeaveSummary, type EmployeeLeave,
  type EmployeeAttendance, type AttendanceMonthlySummary,
} from '../api';

/** Sidebar badge için: sadece bekleyen izin sayısını döndürür */
export function usePendingLeaveCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetchPendingLeaves().then(({ data }) => {
      setCount(data?.length ?? 0);
    });
  }, []);

  return count;
}

export function useLeaveSummaries() {
  const [summaries, setSummaries] = useState<LeaveSummary[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchLeaveSummaries();
    setSummaries(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { summaries, loading, refetch: load };
}

export function usePendingLeaves() {
  const [leaves, setLeaves]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchPendingLeaves();
    setLeaves(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { leaves, loading, refetch: load };
}

export function useEmployeeLeaves(employeeId: string | null) {
  const [leaves, setLeaves]   = useState<EmployeeLeave[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await fetchLeaves(employeeId);
    setLeaves(data ?? []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  return { leaves, loading, refetch: load };
}

export function useAttendance(employeeId: string | null, month: string) {
  const [records, setRecords]   = useState<EmployeeAttendance[]>([]);
  const [summary, setSummary]   = useState<AttendanceMonthlySummary | null>(null);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const [att, sum] = await Promise.all([
      fetchAttendance(employeeId, month),
      fetchMonthlyAttendanceSummary(employeeId),
    ]);
    setRecords(att.data ?? []);
    const monthSummary = (sum.data ?? []).find(s => s.month.startsWith(month));
    setSummary(monthSummary ?? null);
    setLoading(false);
  }, [employeeId, month]);

  useEffect(() => { load(); }, [load]);

  return { records, summary, loading, refetch: load };
}
