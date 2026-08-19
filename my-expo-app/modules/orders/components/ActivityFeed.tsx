// modules/orders/components/ActivityFeed.tsx
// Stage'e ait aktivite eventlerinin zaman çizelgesi.
// Workstation içinde "kim ne zaman ne yaptı" kanıtı.

import React, { useEffect, useState } from 'react';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text} from 'react-native';
import {
  FileUp, Pause, Play, Cog, Hourglass, AlertOctagon, RotateCcw, Check,
  ShieldCheck, Edit3, Beaker, Activity, MessageSquare, Settings,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

type EventSource = 'manual' | 'system' | 'machine_api';

interface ActivityEvent {
  id:          string;
  event_type:  string;
  source:      EventSource;
  payload:     any | null;
  occurred_at: string;
  actor_id:    string | null;
  actor_name?: string | null;
}

// Event türü → ikon + renk + okunabilir etiket
function makeEventMeta(p: StationPalette): Record<string, { icon: any; color: string; label: string }> {
  return {
    stage_completed:    { icon: Check,        color: '#059669', label: 'Aşama tamamlandı' },
    stage_paused:       { icon: Pause,        color: '#B5752A', label: 'Durduruldu' },
    stage_resumed:      { icon: Play,         color: '#3B82F6', label: 'Tekrar başlatıldı' },
    stage_state_changed:{ icon: Activity,     color: p.ink500,  label: 'State değişti' },
    material_confirmed: { icon: Beaker,       color: '#7C3AED', label: 'Malzeme onaylandı' },
    qc_rejected:        { icon: AlertOctagon, color: '#DC2626', label: 'QC reddetti' },
    qc_approved:        { icon: ShieldCheck,  color: '#059669', label: 'QC onayladı' },
    stl_uploaded:       { icon: FileUp,       color: '#0891B2', label: 'STL yüklendi' },
    file_uploaded:      { icon: FileUp,       color: '#0891B2', label: 'Dosya yüklendi' },
    note_added:         { icon: MessageSquare,color: p.ink500,  label: 'Not eklendi' },
    timing_overridden:  { icon: Settings,     color: '#EA580C', label: 'Süre düzeltildi' },
    machine_job_sent:   { icon: Cog,          color: '#0891B2', label: 'Makineye gönderildi' },
  };
}

function getMeta(eventType: string, p: StationPalette) {
  return makeEventMeta(p)[eventType] ?? { icon: Activity, color: p.ink500, label: eventType.replace(/_/g, ' ') };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)} ${autoT('sn önce')}`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} ${autoT('dk önce')}`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ${autoT('saat önce')}`;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function describeEvent(e: ActivityEvent, p: StationPalette): string {
  const meta = getMeta(e.event_type, p);
  if (e.event_type === 'qc_rejected' && Array.isArray(e.payload?.reasons)) {
    return `${meta.label} · ${e.payload.reasons.length} sebep`;
  }
  if (e.event_type === 'stage_state_changed' && e.payload?.from && e.payload?.to) {
    return `${meta.label}: ${e.payload.from} → ${e.payload.to}`;
  }
  if (e.event_type === 'timing_overridden' && e.payload?.field) {
    return `${meta.label} · ${e.payload.field}`;
  }
  return meta.label;
}

const SOURCE_LABEL: Record<EventSource, string> = {
  manual:      'manuel',
  system:      'sistem',
  machine_api: 'makine',
};

export function ActivityFeed({ stageId }: { stageId: string }) {
  const P = useStationTheme();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('stage_activity_events')
        .select('id, event_type, source, payload, occurred_at, actor_id')
        .eq('stage_id', stageId)
        .order('occurred_at', { ascending: false })
        .limit(20);
      if (!alive) return;
      setEvents((data ?? []) as ActivityEvent[]);
      setLoading(false);
    })();

    // Realtime — yeni event'lerde tazele
    const ch = supabase
      .channel(`activity-${stageId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stage_activity_events', filter: `stage_id=eq.${stageId}` },
        (payload: any) => {
          if (!alive) return;
          setEvents(prev => [payload.new as ActivityEvent, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [stageId]);

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Aktivite Akışı
        </Text>
        <Text style={{ fontSize: 11, color: P.ink400 }}>
          {events.length === 0 ? '—' : `son ${events.length}`}
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        </View>
      ) : events.length === 0 ? (
        <View style={{ paddingVertical: 22, paddingHorizontal: 20, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12, color: P.ink500, textAlign: 'center' }}>
            Henüz aktivite yok
          </Text>
          <Text style={{ fontSize: 10.5, color: P.ink400, textAlign: 'center', maxWidth: 260 }}>
            Aşama üzerinde işlem yapıldıkça burada görünür
          </Text>
        </View>
      ) : (
        <View>
          {events.map((e, idx) => {
            const meta = getMeta(e.event_type, P);
            const Icon = meta.icon;
            return (
              <View
                key={e.id}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 11,
                  paddingHorizontal: 16, paddingVertical: 11,
                  borderBottomWidth: idx < events.length - 1 ? 1 : 0,
                  borderBottomColor: P.ink100,
                }}
              >
                <View style={{
                  width: 26, height: 26, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hexA(meta.color, 0.12),
                  borderWidth: 1, borderColor: hexA(meta.color, 0.22),
                  marginTop: 1,
                }}>
                  <Icon size={13} color={meta.color} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: P.ink900 }}>
                      {describeEvent(e, P)}
                    </Text>
                    <View style={{
                      paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                      backgroundColor: P.ink50,
                    }}>
                      <Text style={{ fontSize: 8.5, fontWeight: '700', color: P.ink500, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {SOURCE_LABEL[e.source] ?? e.source}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10.5, color: P.ink400 }}>
                    {formatTime(e.occurred_at)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
