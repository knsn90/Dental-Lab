// Bekleyen tasarım onayı sayısı — sidebar "Onaylar" rozeti için.
// RLS, sonucu kullanıcının (hekim/klinik) erişebildiği siparişlerle sınırlar.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';

export function usePendingApprovalsCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const { count: c } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_approval_status', 'pending');
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) void load(); };
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [load]);

  return count;
}
