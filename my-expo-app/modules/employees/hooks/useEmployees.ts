import { useState, useEffect, useCallback } from 'react';
import {
  fetchEmployees, fetchSalaryPayments, fetchAdvances,
  type Employee, type SalaryPayment, type EmployeeAdvance,
} from '../api';

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchEmployees();
    setEmployees(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { employees, loading, refetch: load };
}

export function useEmployeeDetail(employeeId: string | null) {
  const [salaries, setSalaries]   = useState<SalaryPayment[]>([]);
  const [advances, setAdvances]   = useState<EmployeeAdvance[]>([]);
  const [loading, setLoading]     = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const [s, a] = await Promise.all([
      fetchSalaryPayments(employeeId),
      fetchAdvances(employeeId),
    ]);
    setSalaries(s.data ?? []);
    setAdvances(a.data ?? []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  return { salaries, advances, loading, refetch: load };
}
