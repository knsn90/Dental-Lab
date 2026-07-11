// modules/orders/components/TimingAuditHistory.tsx
// Manager-only audit izleyici. Bir stage için 3 kaynaktan veri toplar:
//   • stage_state_transitions  — kim ne zaman state değiştirdi + sebep
//   • stage_timing_overrides   — kim hangi alanı eski→yeni değer + sebep
//   • stage_activity_events    — qc_rejected/material_confirmed/machine_*
//
// Hepsini birleştirip tersine kronolojik sıraya dizer (collapsible).

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Activity, ArrowRight, Settings, ChevronDown, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { formatDuration, getStageStateMeta } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

type EntryKind = 'transition' | 'override' | 'event';

interface AuditEntry {
  kind:        EntryKind;
  occurred_at: string;
  actor_id:    string | null;
  // transition
  from_status?: string | null;
  to_status?:   string | null;
  // override
  field_name?:  string;
  old_value?:   number | null;
  new_value?:   number | null;
  // event
  event_type?:  string;
  payload?:     any;
  source?:      string;
  // ortak
  reason?:      string | null;
}

const FIELD_LABEL: Record<string, string> = {
  active_work_seconds:    'Operatör süresi',
  machine_runtime_seconds:'Makine süresi',
  operator_setup_seconds: 'Hazırlık süresi',
  queue_waiting_seconds:  'Kuyruk süresi',
};

function formatRel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)        return `${Math.floor(diff / 1000)} sn önce`;
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} saat önce`;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TimingAuditHistory({ stageId }: { stageId: string }) {
  const P = useStationTheme();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [t, o, e] = await Promise.all([
        supabase.from('stage_state_transitions')
          .select('from_status, to_status, reason, actor_id, occurred_at')
          .eq('stage_id', stageId)
          .order('occurred_at', { ascending: false }).limit(40),
        supabase.from('stage_timing_overrides')
          .select('field_name, old_value, new_value, reason, actor_id, occurred_at')
          .eq('stage_id', stageId)
          .order('occurred_at', { ascending: false }).limit(40),
        supabase.from('stage_activity_events')
          .select('event_type, source, payload, actor_id, occurred_at')
          .eq('stage_id', stageId)
          .in('event_type', ['qc_rejected','material_confirmed','machine_job_started','machine_job_completed','machine_error'])
          .order('occurred_at', { ascending: false }).limit(40),
      ]);
      if (!alive) return;

      const all: AuditEntry[] = [
        ...((t.data ?? []) as any[]).map(r => ({ kind: 'transition' as EntryKind, ...r })),
        ...((o.data ?? []) as any[]).map(r => ({ kind: 'override'   as EntryKind, ...r })),
        ...((e.data ?? []) as any[]).map(r => ({ kind: 'event'      as EntryKind, ...r })),
      ];
      all.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      setEntries(all);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [stageId]);

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 11,
          borderBottomWidth: expanded ? 1 : 0, borderBottomColor: P.ink100,
          backgroundColor: hovered ? P.ink50 : P.surfaceAlt,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Activity size={13} color="#EA580C" strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Audit Geçmişi
          </Text>
          <View style={{
            paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
            backgroundColor: hexA('#EA580C', 0.10),
            borderWidth: 1, borderColor: hexA('#EA580C', 0.22),
          }}>
            <Text style={{ fontSize: 8.5, fontWeight: '700', color: '#EA580C', letterSpacing: 0.4 }}>
              MANAGER
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 11, color: P.ink400 }}>
            {entries.length} kayıt
          </Text>
          {expanded
            ? <ChevronDown size={13} color={P.ink400} strokeWidth={1.8} />
            : <ChevronRight size={13} color={P.ink400} strokeWidth={1.8} />}
        </View>
      </Pressable>

      {expanded && (loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        </View>
      ) : entries.length === 0 ? (
        <View style={{ paddingVertical: 22, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: P.ink500 }}>Henüz audit kaydı yok</Text>
        </View>
      ) : (
        <View>
          {entries.map((e, idx) => (
            <AuditRow key={idx} p={P} entry={e} isLast={idx === entries.length - 1} />
          ))}
        </View>
      ))}
    </View>
  );
}

function AuditRow({ p: P, entry, isLast }: { p: StationPalette; entry: AuditEntry; isLast: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 11,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: P.ink100,
      gap: 4,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <KindBadge p={P} kind={entry.kind} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {renderHeadline(P, entry)}
        </View>
        <Text style={{ fontSize: 10, color: P.ink400 }}>
          {formatRel(entry.occurred_at)}
        </Text>
      </View>
      {entry.reason && (
        <Text style={{ fontSize: 11, color: P.ink500, paddingLeft: 70, lineHeight: 15 }} numberOfLines={3}>
          „{entry.reason}"
        </Text>
      )}
    </View>
  );
}

function renderHeadline(P: StationPalette, e: AuditEntry): React.ReactNode {
  if (e.kind === 'transition') {
    const fromMeta = getStageStateMeta(e.from_status ?? '');
    const toMeta   = getStageStateMeta(e.to_status   ?? '');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, color: P.ink500 }}>
          State:
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: fromMeta.color }}>
          {fromMeta.short}
        </Text>
        <ArrowRight size={11} color={P.ink400} strokeWidth={2} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: toMeta.color }}>
          {toMeta.short}
        </Text>
      </View>
    );
  }
  if (e.kind === 'override') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, color: P.ink900, fontWeight: '600' }}>
          {FIELD_LABEL[e.field_name ?? ''] ?? e.field_name}
        </Text>
        <Text style={{ fontSize: 11, color: P.ink400 }}>
          {formatDuration(e.old_value ?? 0)}
        </Text>
        <ArrowRight size={11} color={P.ink400} strokeWidth={2} />
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#EA580C' }}>
          {formatDuration(e.new_value ?? 0)}
        </Text>
      </View>
    );
  }
  // event
  return (
    <Text style={{ fontSize: 12, color: P.ink900, fontWeight: '600' }} numberOfLines={1}>
      {(e.event_type ?? '').replace(/_/g, ' ')}
    </Text>
  );
}

function KindBadge({ p: P, kind }: { p: StationPalette; kind: EntryKind }) {
  const meta = {
    transition: { label: 'STATE', color: P.accent,  icon: Activity },
    override:   { label: 'EDIT',  color: '#EA580C', icon: Settings },
    event:      { label: 'EVENT', color: P.ink500,  icon: Activity },
  }[kind];
  const Icon = meta.icon;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
      backgroundColor: hexA(meta.color, 0.10),
      borderWidth: 1, borderColor: hexA(meta.color, 0.22),
      minWidth: 56, justifyContent: 'center',
    }}>
      <Icon size={9} color={meta.color} strokeWidth={2} />
      <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color, letterSpacing: 0.4 }}>
        {meta.label}
      </Text>
    </View>
  );
}
