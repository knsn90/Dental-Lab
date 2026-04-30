// modules/station/hooks/useKanbanData.ts
// Stage-driven Kanban data layer. Groups by Stage (TRIAGE → QC), not by station name.
// Realtime: order_stages + work_orders.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../core/api/supabase';
import { mapStationToStage, KANBAN_STAGES } from '../../orders/stationMapping';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KanbanCard {
  id:                string;
  order_number:      string;
  work_type:         string;
  delivery_date:     string;
  is_rush:           boolean;
  status:            string;
  box_code:          string | null;

  current_stage_id:  string | null;
  current_sequence:  number | null;
  stage_status:      string | null;
  stage_started_at:  string | null;

  current_station_name:  string | null;
  current_station_color: string | null;

  technician_id:    string | null;
  technician_name:  string | null;

  doctor_name:      string | null;
  clinic_name:      string | null;

  // Derived (added in hook)
  current_stage:    Stage;             // explicit, never undefined
  priority?:        string;
  delay_reason?:    string | null;
  rework_count?:    number;
  complexity?:      string;
  case_type?:       string | null;
}

export interface KanbanColumn {
  stage:        Stage | 'UNASSIGNED';
  label:        string;
  color:        string;
  cards:        KanbanCard[];
  /** workload by technician for the workload summary line */
  workload:     { name: string; count: number }[];
}

const UNASSIGNED_LABEL = 'Atanmamış';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useKanbanData(labId: string | null | undefined) {
  const [cards,    setCards]    = useState<KanbanCard[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!labId) return;
    setLoading(true);

    const { data, error: err } = await supabase
      .from('v_active_orders_kanban')
      .select('*')
      .order('delivery_date', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Omit<KanbanCard, 'current_stage'>[];
    const enriched: KanbanCard[] = rows.map(r => ({
      ...r,
      current_stage: mapStationToStage(r.current_station_name, 'TRIAGE'),
    }));

    setCards(enriched);
    setLastSync(new Date());
    setError(null);
    setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!labId) return;
    const channel = supabase
      .channel('kanban_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stages' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders'  }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [labId, load]);

  // Build columns: 7 stage columns + Atanmamış. Always render all (empty incl).
  const columns = useMemo<KanbanColumn[]>(() => {
    const buckets = new Map<string, KanbanCard[]>();
    for (const stage of KANBAN_STAGES) buckets.set(stage, []);
    const unassigned: KanbanCard[] = [];

    for (const c of cards) {
      const noOwner = !c.technician_id || !c.current_station_name || c.stage_status === null;
      if (noOwner) {
        unassigned.push(c);
        continue;
      }
      buckets.get(c.current_stage)?.push(c);
    }

    const stageCols: KanbanColumn[] = KANBAN_STAGES.map(stage => {
      const list = buckets.get(stage) ?? [];
      // workload summary by technician
      const wmap = new Map<string, number>();
      for (const c of list) {
        const n = c.technician_name ?? 'Atanmadı';
        wmap.set(n, (wmap.get(n) ?? 0) + 1);
      }
      return {
        stage,
        label: STAGE_LABEL[stage],
        color: STAGE_COLOR[stage],
        cards: list.sort((a, b) => {
          const order = { aktif: 0, bekliyor: 1, tamamlandi: 2 };
          return (order[a.stage_status as keyof typeof order] ?? 3) -
                 (order[b.stage_status as keyof typeof order] ?? 3);
        }),
        workload: Array.from(wmap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      };
    });

    const unassignedCol: KanbanColumn = {
      stage: 'UNASSIGNED',
      label: UNASSIGNED_LABEL,
      color: '#94A3B8',
      cards: unassigned,
      workload: [],
    };

    return [...stageCols, unassignedCol];
  }, [cards]);

  return { columns, cards, loading, error, lastSync, refresh: load };
}
