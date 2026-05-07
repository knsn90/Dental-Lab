import { useState, useEffect, useCallback } from 'react';
import {
  fetchEmployees, fetchSalaryPayments, fetchAdvances,
  type Employee, type EmployeeRole, type SalaryPayment, type EmployeeAdvance,
} from '../api';
import { supabase } from '../../../core/api/supabase';

// profiles.role → employees.role eşleştirmesi
const PROFILE_ROLE_MAP: Record<string, EmployeeRole> = {
  manager:      'yonetici',
  technician:   'teknisyen',
  accounting:   'muhasebe',
  receptionist: 'sekreter',
  courier:      'diger',
  service:      'diger',
  intern:       'diger',
};

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // 1. Mevcut employees kayıtları
    const { data: empData } = await fetchEmployees();
    const empRows: Employee[] = (empData ?? []) as Employee[];

    // 2. profiles tablosundaki lab kullanıcılarını da çek (employees'da olmayanlar için)
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, is_active, created_at')
      .eq('user_type', 'lab')
      .order('full_name');

    // 3. Email/isim üzerinden dedup et — employees'da zaten varsa profiles'tan getirme
    const empEmails = new Set(
      empRows.map(e => e.email?.toLowerCase()).filter(Boolean) as string[]
    );
    const empNames = new Set(
      empRows.map(e => e.full_name?.toLowerCase()).filter(Boolean) as string[]
    );

    const syntheticEmployees: Employee[] = ((profileRows ?? []) as any[])
      .filter((p) => {
        if (p.email && empEmails.has(p.email.toLowerCase())) return false;
        if (p.full_name && empNames.has(p.full_name.toLowerCase())) return false;
        return true;
      })
      .map((p) => ({
        id:          `profile-${p.id}`,
        lab_id:      '',
        full_name:   p.full_name ?? '—',
        role:        PROFILE_ROLE_MAP[p.role as string] ?? 'diger',
        phone:       p.phone ?? null,
        email:       p.email ?? null,
        tc_no:       null,
        start_date:  p.created_at ?? new Date().toISOString().slice(0, 10),
        end_date:    null,
        base_salary: 0,
        notes:       null,
        is_active:   p.is_active ?? true,
        created_at:  p.created_at ?? new Date().toISOString(),
      } as Employee));

    // 4. Birleştir — aktif olanlar üstte, isme göre sıralı
    const merged = [...empRows, ...syntheticEmployees].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr');
    });

    setEmployees(merged);
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
