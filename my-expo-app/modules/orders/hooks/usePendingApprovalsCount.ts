// Bekleyen tasarım onayı sayısı — sidebar "Onaylar" rozeti için.
// RLS, sonucu kullanıcının (hekim/klinik) erişebildiği siparişlerle sınırlar.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';

export function usePendingApprovalsCount(): number {
  const [count, setCount] = useState(0);
  // Oturum gelmeden sorgu → 401. Ayrıca 60 sn'lik interval de oturum yokken
  // boşuna dönüyordu; ikisi de kimlik gelince başlar.
  const userId = useAuthStore(s => s.session?.user?.id ?? null);

  const load = useCallback(async () => {
    const { count: c } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_approval_status', 'pending');
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const run = () => { if (alive) void load(); };
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [load, userId]);

  return count;
}
