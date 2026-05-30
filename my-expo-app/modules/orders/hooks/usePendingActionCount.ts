// modules/orders/hooks/usePendingActionCount.ts
// Sidebar badge — kaç sipariş işlem bekliyor (atama yapılmamış / yeni geldi).
// Paylaşımlı lab registry kanalını kullanır (lab_id filtreli, ayrı kanal yok).

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useLabWorkOrdersRealtime } from './useLabWorkOrdersRealtime';

export function usePendingActionCount() {
  const labId = useAuthStore((s) => s.profile?.lab_id);
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!labId) return;
    const { count: c } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('lab_id', labId)
      .in('status', ['alindi', 'atama_bekleniyor']);
    setCount(c ?? 0);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  // Shared registry — no extra channel, fires only for this lab
  useLabWorkOrdersRealtime(labId, { onWorkOrders: load });

  return count;
}
