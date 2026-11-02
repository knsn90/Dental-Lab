/**
 * useHeldOrders — beklemedeki işler (madde 13): panolardaki "Beklemede" rozeti ve
 * uzun bekleme hatırlatması.
 *
 * Kural `orderDefs.isHeldOrder` ile aynı: açık (teslim/iptal değil), arşivde değil,
 * `hold_status='on_hold'`, prova beklemesi HARİÇ. Kapsam RLS'ten gelir (lab).
 * En eski bekleme üstte. Gerçek zamanlı yenileme useOrderMetrics ile AYNI paylaşılan
 * kanaldan — yeni kanal açılmaz.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { subscribeShared } from '../../../core/api/sharedChannel';
import { useAuthStore } from '../../../core/store/authStore';
import { useAppResume } from '../../../core/hooks/useAppResume';

export type HeldOrder = {
  id: string;
  order_number: string | null;
  patient_name: string | null;
  created_at: string;
  delivery_date: string | null;
  hold_category: string | null;
  hold_reason: string | null;
  hold_responsible: string | null;
  hold_started_at: string | null;
};

const COLS = 'id, order_number, patient_name, created_at, delivery_date, hold_category, hold_reason, hold_responsible, hold_started_at';

export function useHeldOrders(): { rows: HeldOrder[]; refetch: () => void } {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [rows, setRows] = useState<HeldOrder[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('work_orders')
      .select(COLS)
      .eq('hold_status', 'on_hold')
      // NULL kategori de bekleyen sayılır (neq tek başına NULL'u eler)
      .or('hold_category.is.null,hold_category.neq.client_prova')
      .not('status', 'in', '(teslim_edildi,iptal)')
      .not('is_archived', 'is', true)
      .order('hold_started_at', { ascending: true, nullsFirst: false })
      .limit(200);
    if (!error) setRows((data ?? []) as HeldOrder[]);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const unsubscribe = subscribeShared(
      `work_orders_realtime:${userId}`,
      [
        { event: '*', schema: 'public', table: 'work_orders' },
        { event: '*', schema: 'public', table: 'order_stages' },
      ],
      () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 400);
      },
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [load, userId]);

  useAppResume(() => { load(); });

  return { rows, refetch: load };
}
