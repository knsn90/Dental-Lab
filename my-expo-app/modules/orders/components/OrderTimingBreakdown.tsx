// modules/orders/components/OrderTimingBreakdown.tsx
// Sipariş detay ekranında: bu siparişin her aşamasında ne kadar harcandı.
// Aktif vs Makine vs Kuyruk + lead time özeti.

import React, { useEffect, useState } from 'react';
import { View, Text} from 'react-native';
import { Clock, Cog, Hourglass, Pause, Activity } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { formatDuration, getStageStateMeta } from '../stations/stageStates';
import { StageStateBadge } from './StageStateBadge';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface OrderSummary {
  work_order_id:          string;
  stage_count:            number;
  completed_count:        number;
  active_count:           number;
  blocked_count:          number;
  total_active_seconds:   number;
  total_machine_seconds:  number;
  total_queue_seconds:    number;
  total_paused_seconds:   number;
  lead_time_seconds:      number | null;
  age_seconds:            number;
}

interface StageRow {
  id:                     string;
  sequence_order:         number;
  status:                 string;
  station_name:           string | null;
  station_color:          string | null;
  active_work_seconds:    number;
  machine_runtime_seconds:number;
  queue_waiting_seconds:  number;
  paused_seconds_total:   number;
  started_at:             string | null;
  completed_at:           string | null;
}

export function OrderTimingBreakdown({ workOrderId }: { workOrderId: string }) {
  const P = useStationTheme();
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [stages,  setStages]  = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [sum, st] = await Promise.all([
        supabase
          .from('order_timing_summary')
          .select('*')
          .eq('work_order_id', workOrderId)
          .maybeSingle(),
        supabase
          .from('order_stages')
          .select(`
            id, sequence_order, status,
            active_work_seconds, machine_runtime_seconds,
            queue_waiting_seconds, paused_seconds_total,
            started_at, completed_at,
            station:lab_stations(name, color)
          `)
          .eq('work_order_id', workOrderId)
          .order('sequence_order', { ascending: true }),
      ]);
      if (!alive) return;
      if (sum.error || st.error) {
        setError((sum.error?.message ?? st.error?.message) ?? 'Hata');
        setLoading(false);
        return;
      }
      setSummary(sum.data as OrderSummary | null);
      setStages(((st.data ?? []) as any[]).map(r => ({
        id:                      r.id,
        sequence_order:          r.sequence_order ?? 0,
        status:                  r.status,
        station_name:            r.station?.name ?? null,
        station_color:           r.station?.color ?? null,
        active_work_seconds:     r.active_work_seconds ?? 0,
        machine_runtime_seconds: r.machine_runtime_seconds ?? 0,
        queue_waiting_seconds:   r.queue_waiting_seconds ?? 0,
        paused_seconds_total:    r.paused_seconds_total ?? 0,
        started_at:              r.started_at ?? null,
        completed_at:            r.completed_at ?? null,
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workOrderId]);

  if (loading) {
    return (
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, padding: 24, alignItems: 'center', gap: 8,
      }}>
        <Text style={{ fontSize: 12, color: P.ink400 }}>Zamanlama hesaplanıyor…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{
        borderWidth: 1, borderColor: hexA('#DC2626', 0.20), borderRadius: 14,
        backgroundColor: '#FEE2E2', padding: 14,
      }}>
        <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>
          Veri okunamadı: {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Activity size={14} color={P.accent} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Zamanlama Dökümü
          </Text>
        </View>
      </View>

      {/* Summary row */}
      {summary && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: P.ink100 }}>
          <SummaryCell p={P} label="Operatör" value={formatDuration(summary.total_active_seconds || 0)}  icon={Clock}     color={P.accent} />
          {summary.total_machine_seconds > 0 && (
            <SummaryCell p={P} label="Makine"   value={formatDuration(summary.total_machine_seconds)} icon={Cog}       color="#0891B2" />
          )}
          <SummaryCell p={P} label="Kuyruk"   value={formatDuration(summary.total_queue_seconds || 0)} icon={Hourglass} color={P.ink400} />
          {summary.total_paused_seconds > 0 && (
            <SummaryCell p={P} label="Pause"  value={formatDuration(summary.total_paused_seconds)} icon={Pause}     color="#B5752A" />
          )}
          {summary.lead_time_seconds !== null && (
            <SummaryCell p={P} label="Lead Time" value={formatDuration(summary.lead_time_seconds)} icon={Activity}  color={P.accentDeep} />
          )}
        </View>
      )}

      {/* Per-stage rows */}
      {stages.length === 0 ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: P.ink500 }}>Henüz aşama yok</Text>
        </View>
      ) : (
        <View>
          {stages.map((s, idx) => {
            const meta = getStageStateMeta(s.status);
            return (
              <View
                key={s.id}
                style={{
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: idx < stages.length - 1 ? 1 : 0,
                  borderBottomColor: P.ink100,
                  gap: 8,
                }}
              >
                {/* Stage header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 24, height: 24, borderRadius: 7,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hexA(s.station_color ?? P.ink400, 0.12),
                    borderWidth: 1, borderColor: hexA(s.station_color ?? P.ink400, 0.22),
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: s.station_color ?? P.ink500 }}>
                      {s.sequence_order}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink900, flex: 1 }} numberOfLines={1}>
                    {s.station_name ?? '—'}
                  </Text>
                  <StageStateBadge status={s.status as any} size="sm" />
                </View>

                {/* Timing strip */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingLeft: 34 }}>
                  {s.active_work_seconds > 0 && (
                    <Strip p={P} icon={Clock} color={P.accent} value={formatDuration(s.active_work_seconds)} label="aktif" />
                  )}
                  {s.machine_runtime_seconds > 0 && (
                    <Strip p={P} icon={Cog} color="#0891B2" value={formatDuration(s.machine_runtime_seconds)} label="makine" />
                  )}
                  {s.queue_waiting_seconds > 0 && (
                    <Strip p={P} icon={Hourglass} color={P.ink400} value={formatDuration(s.queue_waiting_seconds)} label="kuyruk" />
                  )}
                  {s.paused_seconds_total > 0 && (
                    <Strip p={P} icon={Pause} color="#B5752A" value={formatDuration(s.paused_seconds_total)} label="pause" />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SummaryCell({ p: P, label, value, icon: Icon, color }: { p: StationPalette; label: string; value: string; icon: any; color: string }) {
  return (
    <View style={{
      width: '33.333%', minWidth: 140,
      paddingHorizontal: 14, paddingVertical: 11,
      borderRightWidth: 1, borderRightColor: P.ink100,
      gap: 3,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon size={10} color={color} strokeWidth={1.8} />
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900, letterSpacing: -0.2 }}>
        {value}
      </Text>
    </View>
  );
}

function Strip({ p: P, icon: Icon, color, value, label }: { p: StationPalette; icon: any; color: string; value: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon size={10} color={color} strokeWidth={1.8} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900 }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: P.ink400 }}>{label}</Text>
    </View>
  );
}
