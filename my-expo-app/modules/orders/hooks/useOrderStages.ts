// modules/orders/hooks/useOrderStages.ts
// Bir iş emrinin üretim aşamalarını gerçek zamanlı olarak çeken hook.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';

// ── Tipler ────────────────────────────────────────────────────────────────────

export type StageStatus = 'bekliyor' | 'aktif' | 'tamamlandi' | 'onaylandi' | 'reddedildi' | 'skipped';

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
  skipped_reason?: string | null;
  station: { id: string; name: string; color: string; icon?: string } | null;
  technician: { id: string; full_name: string } | null;
  // Phase A timing
  active_work_seconds?:     number;
  machine_runtime_seconds?: number;
  queue_waiting_seconds?:   number;
  paused_seconds_total?:    number;
  // Estimated total minutes given by the technician on start
  estimated_minutes?:       number | null;
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
        skipped_reason,
        active_work_seconds,
        machine_runtime_seconds,
        queue_waiting_seconds,
        paused_seconds_total,
        estimated_minutes,
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

  // Türetilmiş değerler — skipped stages execution flow'una dahil değil
  const executionStages = stages.filter(s => s.status !== 'skipped');
  const skippedStages   = stages.filter(s => s.status === 'skipped');

  // Şu an çalışılan aşama = SADECE 'aktif' status'lu olan.
  // 'tamamlandi' eskiden dahildi ama bu ilk-tamamlananı dönerek yanlış
  // "currentStation" gösteriyor (Tarama tamamlandıysa o seçilirdi).
  const activeStage = executionStages.find(s => s.status === 'aktif') ?? null;

  const pendingStages = executionStages.filter(s => s.status === 'bekliyor');
  const completedCount = executionStages.filter(
    s => s.status === 'onaylandi' || s.status === 'tamamlandi',
  ).length;

  return {
    stages: executionStages,        // UI'da yalnız aktif rota gösterilir
    allStages: stages,              // gerekirse skipped'ları da kapsayan tam liste
    skippedStages,
    loading,
    activeStage,
    pendingStages,
    completedCount,
    totalStages: executionStages.length,
    refetch: fetchStages,
  };
}
