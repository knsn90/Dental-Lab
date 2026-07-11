// modules/orders/components/StationPerformancePanel.tsx
// Lab manager için üretim zekası paneli:
// İstasyon bazında ortalama aktif süre, kuyruk bekleme, throughput, bottleneck flag.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView} from 'react-native';
import { Cog, Clock, Hourglass, TrendingUp, AlertTriangle, Zap } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { formatDuration } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface StationStat {
  station_id:            string;
  station_name:          string;
  station_color:         string | null;
  completed_count:       number;
  completed_last_30d:    number;
  completed_last_7d:     number;
  avg_active_seconds:    number;
  avg_machine_seconds:   number;
  avg_queue_seconds:     number;
  avg_paused_seconds:    number;
  avg_elapsed_seconds:   number;
  median_active_seconds: number;
  median_queue_seconds:  number;
  p90_active_seconds:    number;
  last_completion_at:    string | null;
}

interface BottleneckRow {
  station_id:       string;
  bottleneck_level: 'normal' | 'warning' | 'critical' | 'queue';
  slowness_ratio:   number;
}

const LEVEL_META: Record<string, { color: string; label: string; bg: string }> = {
  critical: { color: '#DC2626', label: 'KRİTİK',   bg: '#FEE2E2' },
  warning:  { color: '#B5752A', label: 'YAVAŞ',    bg: '#FEF3C7' },
  queue:    { color: '#0891B2', label: 'KUYRUK',   bg: '#CFFAFE' },
  normal:   { color: '#059669', label: 'NORMAL',   bg: '#D1FAE5' },
};

export function StationPerformancePanel({ accentColor }: { accentColor?: string } = {}) {
  const P = useStationTheme();
  const accent = accentColor ?? P.accent;
  const [stats, setStats] = useState<StationStat[]>([]);
  const [bottlenecks, setBottlenecks] = useState<Map<string, BottleneckRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, b] = await Promise.all([
        supabase.from('station_performance_summary').select('*').order('completed_last_30d', { ascending: false }),
        supabase.from('bottleneck_stations').select('station_id, bottleneck_level, slowness_ratio'),
      ]);
      if (!alive) return;
      if (s.error) {
        setError(s.error.message);
        setLoading(false);
        return;
      }
      setStats((s.data ?? []) as StationStat[]);
      const bm = new Map<string, BottleneckRow>();
      for (const row of (b.data ?? []) as BottleneckRow[]) bm.set(row.station_id, row);
      setBottlenecks(bm);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, padding: 24, alignItems: 'center', gap: 8,
      }}>
        <Text style={{ fontSize: 12, color: P.ink400 }}>Performans verisi yükleniyor…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{
        borderWidth: 1, borderColor: hexA('#DC2626', 0.20), borderRadius: 14,
        backgroundColor: '#FEE2E2', padding: 16,
      }}>
        <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>
          Veri okunamadı: {error}
        </Text>
        <Text style={{ fontSize: 10.5, color: '#991B1B', marginTop: 4 }}>
          station_performance_summary view'inin oluşturulduğundan emin ol (Phase F migration).
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
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={14} color={accent} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            İstasyon Performansı
          </Text>
        </View>
        <Text style={{ fontSize: 10.5, color: P.ink400 }}>
          {stats.length} istasyon · son 30 gün
        </Text>
      </View>

      {stats.length === 0 ? (
        <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, color: P.ink500, fontWeight: '600' }}>Henüz veri yok</Text>
          <Text style={{ fontSize: 10.5, color: P.ink400, textAlign: 'center', maxWidth: 320 }}>
            İstasyonlar tamamlandıkça ortalama süreler burada görünür.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
          {stats.map((s, idx) => {
            const bl = bottlenecks.get(s.station_id);
            const levelMeta = bl ? LEVEL_META[bl.bottleneck_level] : null;
            const stationColor = s.station_color ?? P.ink400;
            return (
              <View
                key={s.station_id}
                style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: idx < stats.length - 1 ? 1 : 0,
                  borderBottomColor: P.ink100,
                  gap: 10,
                }}
              >
                {/* Top: name + bottleneck flag + completed count */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <View style={{
                    width: 26, height: 26, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hexA(stationColor, 0.12),
                    borderWidth: 1, borderColor: hexA(stationColor, 0.24),
                  }}>
                    <Cog size={13} color={stationColor} strokeWidth={1.8} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900, flex: 1 }} numberOfLines={1}>
                    {s.station_name}
                  </Text>
                  {levelMeta && bl && bl.bottleneck_level !== 'normal' && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6,
                      backgroundColor: levelMeta.bg,
                      borderWidth: 1, borderColor: hexA(levelMeta.color, 0.30),
                    }}>
                      <AlertTriangle size={9} color={levelMeta.color} strokeWidth={2.4} />
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: levelMeta.color, letterSpacing: 0.4 }}>
                        {levelMeta.label}
                        {bl.slowness_ratio > 1 && ` ${bl.slowness_ratio}x`}
                      </Text>
                    </View>
                  )}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6,
                    backgroundColor: P.ink50, borderWidth: 1, borderColor: P.ink100,
                  }}>
                    <Zap size={9} color={P.ink500} strokeWidth={2.2} />
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.ink700 }}>
                      {s.completed_last_30d}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: P.ink400 }}>
                      / 30g
                    </Text>
                  </View>
                </View>

                {/* Stats row — mean + median + p90 */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  <StatCell
                    p={P}
                    icon={Clock}
                    color={P.accent}
                    label="Operatör · ort"
                    value={formatDuration(s.avg_active_seconds || 0)}
                    sub={`med ${formatDuration(s.median_active_seconds || 0)} · p90 ${formatDuration(s.p90_active_seconds || 0)}`}
                  />
                  {s.avg_machine_seconds > 0 && (
                    <StatCell
                      p={P}
                      icon={Cog}
                      color="#0891B2"
                      label="Makine · ort"
                      value={formatDuration(s.avg_machine_seconds)}
                    />
                  )}
                  <StatCell
                    p={P}
                    icon={Hourglass}
                    color={P.ink400}
                    label="Kuyruk · ort"
                    value={formatDuration(s.avg_queue_seconds || 0)}
                    sub={`med ${formatDuration(s.median_queue_seconds || 0)}`}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function StatCell({ p: P, icon: Icon, color, label, value, sub }: { p: StationPalette; icon: any; color: string; label: string; value: string; sub?: string }) {
  return (
    <View style={{ minWidth: 140, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon size={10} color={color} strokeWidth={1.8} />
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: P.ink900, letterSpacing: -0.2 }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ fontSize: 10, color: P.ink400 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}
