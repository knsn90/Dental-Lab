// ─────────────────────────────────────────────────────────────────────────
//  useDoctorBalance — hekim dashboard'u için kliniğinin cari bakiyesini çeker.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { fetchClinicBalance } from '../api';
import { useDoctorScope } from '../../clinics/hooks/useDoctorScope';
import type { ClinicBalance } from '../types';

export function useDoctorBalance() {
  const { clinicId } = useDoctorScope();
  const [balance, setBalance] = useState<ClinicBalance | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const { data } = await fetchClinicBalance(clinicId);
    setBalance(data ?? null);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { void load(); }, [load]);

  return { balance, loading, refetch: load };
}
