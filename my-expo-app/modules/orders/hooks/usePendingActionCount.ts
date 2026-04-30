// modules/orders/hooks/usePendingActionCount.ts
// Sidebar badge — kaç sipariş işlem bekliyor (atama yapılmamış / yeni geldi).
// Hafif count query + realtime sub.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';

export function usePendingActionCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const { count: c } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['alindi', 'atama_bekleniyor']);
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pending_action_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return count;
}
