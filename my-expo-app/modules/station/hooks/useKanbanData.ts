// modules/station/hooks/useKanbanData.ts
// Üretim panosu veri katmanı. Kolonlar lab'ın GERÇEK istasyonlarından (lab_stations,
// sequence_hint sırasıyla) üretilir; kartlar current_station_name ile o kolona düşer.
// card.current_stage (checklist/SLA için) yine stage eşlemesinden gelir.
// Realtime: order_stages + work_orders.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAppResume } from '../../../core/hooks/useAppResume';
import { mapStationToStage } from '../../orders/stationMapping';
import { type Stage } from '../../orders/stages';

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
  parallel_group:        number | null;

  technician_id:    string | null;
  technician_name:  string | null;

  doctor_name:      string | null;
  clinic_name:      string | null;

  // Derived (added in hook)
  current_stage:    Stage;             // checklist/SLA için stage eşlemesi
  priority?:        string;
  delay_reason?:    string | null;
  rework_count?:    number;
  complexity?:      string;
  case_type?:       string | null;
}

export interface KanbanColumn {
  key:          string;            // station id veya 'UNASSIGNED'
  label:        string;
  color:        string;
  cards:        KanbanCard[];
  workload:     { name: string; count: number }[];
  isUnassigned: boolean;
  overdue:      number;            // teslim tarihi geçmiş kart sayısı (operasyonel zeka)
}

interface StationRow { id: string; name: string; color: string | null; sequence_hint: number | null; }

const UNASSIGNED_LABEL = 'Atanmamış';
const isOverdue = (d: string | null) => { if (!d) return false; const t = new Date(d).getTime(); return Number.isFinite(t) && t < Date.now(); };

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useKanbanData(labId: string | null | undefined) {
  const [cards,    setCards]    = useState<KanbanCard[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!labId) return;
    setLoading(true);

    const [{ data, error: err }, stRes] = await Promise.all([
      supabase.from('v_active_orders_kanban').select('*').order('delivery_date', { ascending: true }),
      supabase.from('lab_stations').select('id, name, color, sequence_hint').eq('is_active', true).order('sequence_hint', { ascending: true }),
    ]);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // 'iptal' savunması — view migration'ı (20260711140000) uygulanana kadar
    // iptal edilen siparişler view'dan gelebilir; panoda asla gösterme.
    const rows = ((data ?? []) as Omit<KanbanCard, 'current_stage'>[])
      .filter(r => r.status !== 'iptal');
    const enriched: KanbanCard[] = rows.map(r => ({
      ...r,
      current_stage: mapStationToStage(r.current_station_name, 'TRIAGE'),
    }));

    setCards(enriched);
    setStations(((stRes.data ?? []) as StationRow[]));
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

  // Ön plana dönünce tazele — askıdayken kaçan realtime olaylarını telafi eder.
  useAppResume(() => { void load(); }, { enabled: !!labId });

  // Kolonlar: gerçek istasyonlar (sequence sırasıyla) + kartlarda görülen ekstra istasyonlar + Atanmamış.
  const columns = useMemo<KanbanColumn[]>(() => {
    const byName = new Map<string, KanbanCard[]>();   // station name → cards
    const unassigned: KanbanCard[] = [];

    for (const c of cards) {
      const noOwner = !c.technician_id || !c.current_station_name || c.stage_status === null;
      if (noOwner) { unassigned.push(c); continue; }
      const key = c.current_station_name as string;
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(c);
    }

    // İstasyon sırası: aktif istasyonlar (sequence) önce; kartlarda olup listede olmayanlar sona.
    const ordered: StationRow[] = [...stations];
    const known = new Set(stations.map(s => s.name));
    for (const name of byName.keys()) {
      if (!known.has(name)) ordered.push({ id: `x:${name}`, name, color: null, sequence_hint: 9999 });
    }

    const sortCards = (list: KanbanCard[]) => list.sort((a, b) => {
      const order = { aktif: 0, bekliyor: 1, tamamlandi: 2 } as Record<string, number>;
      return (order[a.stage_status as string] ?? 3) - (order[b.stage_status as string] ?? 3);
    });

    const stationCols: KanbanColumn[] = ordered.map((st) => {
      const list = byName.get(st.name) ?? [];
      const wmap = new Map<string, number>();
      for (const c of list) { const n = c.technician_name ?? 'Atanmadı'; wmap.set(n, (wmap.get(n) ?? 0) + 1); }
      return {
        key: st.id,
        label: st.name,
        color: st.color || list[0]?.current_station_color || '#3B82F6',
        cards: sortCards(list),
        workload: Array.from(wmap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        isUnassigned: false,
        overdue: list.filter(c => isOverdue(c.delivery_date)).length,
      };
    });

    const unassignedCol: KanbanColumn = {
      key: 'UNASSIGNED',
      label: UNASSIGNED_LABEL,
      color: '#94A3B8',
      cards: sortCards(unassigned),
      workload: [],
      isUnassigned: true,
      overdue: unassigned.filter(c => isOverdue(c.delivery_date)).length,
    };

    return [...stationCols, unassignedCol];
  }, [cards, stations]);

  return { columns, cards, loading, error, lastSync, refresh: load };
}
