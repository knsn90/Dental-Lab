// modules/orders/components/ManagerPanel.tsx
// Manager-only kompakt panel: current stage / owner / idle / rework + reassign + priority
// Hero card altında, ticket card öncesi yer alır.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { ReassignModal } from './ReassignModal';
import type { Stage } from '../stages';
import { STAGE_LABEL } from '../stages';

type Priority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string; bg: string }[] = [
  { value: 'low',     label: 'Düşük',  color: '#64748B', bg: '#F1F5F9' },
  { value: 'normal',  label: 'Normal', color: '#2563EB', bg: '#EFF6FF' },
  { value: 'high',    label: 'Yüksek', color: '#D97706', bg: '#FEF3C7' },
  { value: 'urgent',  label: 'ACİL',   color: '#DC2626', bg: '#FEE2E2' },
];

interface Props {
  workOrderId:    string;
  currentStage:   Stage | null;
  ownerName:      string | null;
  ownerId?:       string | null;
  activeStageId?: string | null;
  startedAt?:     string | null;     // activeStage.assigned_at veya started_at
  reworkCount:    number;
  priority:       Priority;
  labId:          string;
  onChanged:      () => void;
  /** heroCard içine gömüldüğünde card chrome'ı kapat (bg/border/shadow yok). */
  embedded?:      boolean;
}

export function ManagerPanel({
  workOrderId, currentStage, ownerName, ownerId, activeStageId, startedAt,
  reworkCount, priority, labId, onChanged, embedded = false,
}: Props) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [updatingPriority, setUpdatingPriority] = useState(false);

  // Idle ticker — 30s'de bir
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const idle = startedAt
    ? humanIdle(now - new Date(startedAt).getTime())
    : '—';

  async function setPriority(p: Priority) {
    setUpdatingPriority(true);
    const { error } = await supabase.from('work_orders').update({ priority: p }).eq('id', workOrderId);
    setUpdatingPriority(false);
    if (error) { toast.error('Öncelik güncellenemedi: ' + error.message); return; }
    toast.success('Öncelik: ' + PRIORITY_OPTIONS.find(o => o.value === p)?.label);
    onChanged();
  }

  return (
    <View style={[s.card, embedded && s.cardEmbedded]}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <View style={[s.iconWrap, embedded && s.iconWrapEmbedded]}>
            <AppIcon name="users" size={14} color={embedded ? '#FFFFFF' : '#7C3AED'} />
          </View>
          <Text style={[s.title, embedded && s.titleEmbedded]}>Yönetici Paneli</Text>
        </View>
        {/* Priority pill cluster */}
        <View style={s.priorityRow}>
          {PRIORITY_OPTIONS.map(p => {
            const active = priority === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                onPress={() => !active && setPriority(p.value)}
                disabled={updatingPriority || active}
                style={[
                  s.priorityChip,
                  embedded && s.priorityChipEmbedded,
                  active && (embedded
                    ? { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.40)' }
                    : { backgroundColor: p.bg, borderColor: p.color }),
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.priorityText,
                    embedded && s.priorityTextEmbedded,
                    active && (embedded
                      ? { color: '#FFFFFF', fontWeight: '800' }
                      : { color: p.color, fontWeight: '800' }),
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Stat grid */}
      <View style={s.statGrid}>
        <Stat embedded={embedded} label="Mevcut Aşama" value={currentStage ? STAGE_LABEL[currentStage] : '—'} />
        <Stat embedded={embedded} label="Sorumlu"      value={ownerName ?? 'Atanmadı'} />
        <Stat embedded={embedded} label="Idle Süre"    value={idle} alert={startedAt ? (now - new Date(startedAt).getTime()) > 8 * 3600_000 : false} />
        <Stat embedded={embedded} label="Rework"       value={String(reworkCount)} alert={reworkCount > 0} />
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <TouchableOpacity
          onPress={() => setReassignOpen(true)}
          style={[s.actionBtn, embedded && s.actionBtnEmbedded]}
          activeOpacity={0.85}
          disabled={!activeStageId || !currentStage}
        >
          <AppIcon name="users" size={13} color={embedded ? '#FFFFFF' : '#7C3AED'} />
          <Text style={[s.actionText, embedded && s.actionTextEmbedded]}>Yeniden Ata</Text>
        </TouchableOpacity>
      </View>

      {reassignOpen && activeStageId && currentStage && (
        <ReassignModal
          visible
          stageId={activeStageId}
          stage={currentStage}
          labId={labId}
          currentOwnerId={ownerId ?? null}
          onClose={() => setReassignOpen(false)}
          onReassigned={onChanged}
        />
      )}
    </View>
  );
}

function Stat({ label, value, alert, embedded }: { label: string; value: string; alert?: boolean; embedded?: boolean }) {
  const alertColor = embedded ? '#FCA5A5' : '#DC2626';
  return (
    <View style={[s.stat, embedded && s.statEmbedded]}>
      <Text style={[s.statLabel, embedded && s.statLabelEmbedded]}>{label}</Text>
      <Text
        style={[
          s.statValue,
          embedded && s.statValueEmbedded,
          alert && { color: alertColor },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function humanIdle(ms: number): string {
  if (ms < 60_000) return Math.floor(ms / 1000) + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'd';
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}s ${m}d`;
  }
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${d}g ${h}s`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: {},
    }),
  },
  // ── Hero kartına gömülü mod (white-on-glass) ─────────────────────────────
  cardEmbedded: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderRadius: 0,
    ...Platform.select({
      web: { boxShadow: 'none' } as any,
      default: {},
    }),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 24, height: 24, borderRadius: 7, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  iconWrapEmbedded: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
  title: { fontSize: 13, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  titleEmbedded: { color: '#FFFFFF', letterSpacing: 0.3, textTransform: 'uppercase' as const, fontSize: 11 },

  priorityRow: { flexDirection: 'row', gap: 4 },
  priorityChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  priorityChipEmbedded: { borderColor: 'rgba(255,255,255,0.18)' },
  priorityText: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3 },
  priorityTextEmbedded: { color: 'rgba(255,255,255,0.65)' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '23%', flexGrow: 1, minWidth: 130, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 10 },
  statEmbedded: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 },
  statLabelEmbedded: { color: 'rgba(255,255,255,0.55)' },
  statValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  statValueEmbedded: { color: '#FFFFFF', fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#F5F3FF',
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  actionBtnEmbedded: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.30)',
    borderRadius: 999,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  actionTextEmbedded: { color: '#FFFFFF', letterSpacing: 0.4 },
});

export default ManagerPanel;
