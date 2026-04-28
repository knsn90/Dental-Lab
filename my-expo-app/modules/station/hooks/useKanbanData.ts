// modules/station/hooks/useKanbanData.ts
// v_active_orders_kanban view'ini gerçek zamanlı dinler, istasyona göre gruplar

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface KanbanCard {
  // İş emri
  id: string;
  order_number: string;
  work_type: string;
  delivery_date: string;
  is_rush: boolean;
  status: string;
  box_code: string | null;
  // Mevcut aşama
  current_stage_id: string | null;
  current_sequence: number | null;
  stage_status: string | null;
  stage_started_at: string | null;
  // İstasyon
  current_station_name: string | null;
  current_station_color: string | null;
  // Teknisyen
  technician_id: string | null;
  technician_name: string | null;
  // Hekim
  doctor_name: string | null;
  clinic_name: string | null;
}

export interface KanbanColumn {
  station_name: string;
  station_color: string;
  cards: KanbanCard[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useKanbanData(labId: string | null | undefined) {
  const [columns,  setColumns]  = useState<KanbanColumn[]>([]);
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

    const cards = (data ?? []) as KanbanCard[];

    // İstasyona göre grupla
    const map = new Map<string, KanbanColumn>();

    // Rota atanmamış veya bekleyen iş emirleri için özel kolon
    const unrouted: KanbanCard[] = [];

    for (const card of cards) {
      if (!card.current_station_name || card.stage_status === null) {
        unrouted.push(card);
        continue;
      }

      const key = card.current_station_name;
      if (!map.has(key)) {
        map.set(key, {
          station_name:  card.current_station_name,
          station_color: card.current_station_color ?? '#6B7280',
          cards: [],
        });
      }
      map.get(key)!.cards.push(card);
    }

    // Sütunları aşama durumuna göre sırala: aktif → bekliyor → tamamlandi
    const colArray = Array.from(map.values()).map(col => ({
      ...col,
      cards: col.cards.sort((a, b) => {
        const order = { aktif: 0, bekliyor: 1, tamamlandi: 2 };
        return (order[a.stage_status as keyof typeof order] ?? 3) -
               (order[b.stage_status as keyof typeof order] ?? 3);
      }),
    }));

    // Rota atanmamış varsa en sona ekle
    if (unrouted.length > 0) {
      colArray.push({
        station_name:  'Rota Yok',
        station_color: '#94A3B8',
        cards: unrouted,
      });
    }

    setColumns(colArray);
    setLastSync(new Date());
    setError(null);
    setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  // Gerçek zamanlı: order_stages veya work_orders değişince yenile
  useEffect(() => {
    if (!labId) return;

    const channel = supabase
      .channel('kanban_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stages' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders'  }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [labId, load]);

  return { columns, loading, error, lastSync, refresh: load };
}
