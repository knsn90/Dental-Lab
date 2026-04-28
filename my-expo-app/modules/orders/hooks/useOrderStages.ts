// modules/orders/hooks/useOrderStages.ts
// Bir iş emrinin üretim aşamalarını gerçek zamanlı olarak çeken hook.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';

// ── Tipler ────────────────────────────────────────────────────────────────────

export type StageStatus = 'bekliyor' | 'aktif' | 'tamamlandi' | 'onaylandi' | 'reddedildi';

export interface StageInfo {
  id: string;
  sequence_order: number;
  status: StageStatus;
  is_critical: boolean;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  technician_note: string | null;
  manager_note: string | null;
  station: { id: string; name: string; color: string; icon?: string } | null;
  technician: { id: string; full_name: string } | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOrderStages(workOrderId: string | undefined) {
  const [stages,  setStages]  = useState<StageInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStages = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);

    const { data } = await supabase
      .from('order_stages')
      .select(`
        id,
        sequence_order,
        status,
        is_critical,
        assigned_at,
        started_at,
        completed_at,
        technician_note,
        manager_note,
        station:station_id ( id, name, color, icon ),
        technician:technician_id ( id, full_name )
      `)
      .eq('work_order_id', workOrderId)
      .order('sequence_order');

    setStages((data ?? []) as unknown as StageInfo[]);
    setLoading(false);
  }, [workOrderId]);

  useEffect(() => {
    fetchStages();

    // Realtime abone ol — order_stages tablosu supabase_realtime'a eklenmiş
    const channel = supabase
      .channel(`order-stages-${workOrderId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'order_stages',
          filter: `work_order_id=eq.${workOrderId}`,
        },
        () => fetchStages(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workOrderId, fetchStages]);

  // Türetilmiş değerler
  const activeStage = stages.find(
    s => s.status === 'aktif' || s.status === 'tamamlandi',
  ) ?? null;

  const pendingStages = stages.filter(s => s.status === 'bekliyor');
  const completedCount = stages.filter(
    s => s.status === 'onaylandi',
  ).length;

  return {
    stages,
    loading,
    activeStage,
    pendingStages,
    completedCount,
    totalStages: stages.length,
    refetch: fetchStages,
  };
}
