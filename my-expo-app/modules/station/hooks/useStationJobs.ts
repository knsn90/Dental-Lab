// modules/station/hooks/useStationJobs.ts
// Teknisyenin aşamalarını gerçek zamanlı dinler

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { fetchMyStages, acceptStage, completeStage, type StationJob } from '../api';

export function useStationJobs(technicianId: string | undefined) {
  const [jobs, setJobs]       = useState<StationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!technicianId) return;
    setLoading(true);
    const { data, error: err } = await fetchMyStages(technicianId);
    if (err) {
      setError(err.message);
    } else {
      // Veriyi düzleştir
      const mapped = (data ?? []).map((row: any) => ({
        id:              row.id,
        work_order_id:   row.work_order_id,
        station_id:      row.station_id,
        sequence_order:  row.sequence_order,
        status:          row.status,
        is_critical:     row.is_critical,
        assigned_at:     row.assigned_at,
        started_at:      row.started_at,
        completed_at:    row.completed_at,
        technician_note: row.technician_note,
        manager_note:    row.manager_note,
        duration_min:    row.duration_min,
        station_name:    row.station?.name ?? '',
        station_color:   row.station?.color ?? '#2563EB',
        work_order: {
          order_number: row.work_orders?.order_number ?? '',
          work_type:    row.work_orders?.work_type ?? '',
          tooth_numbers:row.work_orders?.tooth_numbers ?? [],
          shade:        row.work_orders?.shade ?? null,
          delivery_date:row.work_orders?.delivery_date ?? '',
          is_rush:      row.work_orders?.is_rush ?? false,
          notes:        row.work_orders?.notes ?? null,
          doctor_name:  row.work_orders?.doctor?.full_name ?? null,
          clinic_name:  row.work_orders?.doctor?.clinic_name ?? null,
          box_code:     row.work_orders?.box?.box_code ?? null,
        },
      })) as StationJob[];

      // Önce aktif, sonra bekleyen, sonra tamamlanan
      mapped.sort((a, b) => {
        const order = { aktif: 0, bekliyor: 1, tamamlandi: 2 };
        return (order[a.status as keyof typeof order] ?? 3) -
               (order[b.status as keyof typeof order] ?? 3);
      });

      setJobs(mapped);
    }
    setLoading(false);
  }, [technicianId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription — order_stages değişince yenile
  useEffect(() => {
    if (!technicianId) return;
    const channel = supabase
      .channel(`station_jobs_${technicianId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_stages',
          filter: `technician_id=eq.${technicianId}`,
        },
        () => load(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [technicianId, load]);

  const accept = useCallback(async (stageId: string) => {
    const { error: err } = await acceptStage(stageId);
    if (!err) load();
    return { error: err };
  }, [load]);

  const complete = useCallback(async (stageId: string, note?: string) => {
    const { error: err } = await completeStage(stageId, note);
    if (!err) load();
    return { error: err };
  }, [load]);

  const activeJob  = jobs.find((j) => j.status === 'aktif')   ?? null;
  const queuedJobs = jobs.filter((j) => j.status === 'bekliyor');
  const doneJobs   = jobs.filter((j) => j.status === 'tamamlandi');

  return { jobs, activeJob, queuedJobs, doneJobs, loading, error, refresh: load, accept, complete };
}
