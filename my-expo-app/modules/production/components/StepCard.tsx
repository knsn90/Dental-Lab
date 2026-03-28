import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CaseStep, StepStatus } from '../types';
import { STEP_ICONS } from '../../workflow/templates';

interface Props {
  step: CaseStep;
  isCurrentUser?: boolean;
  onStart?: (step: CaseStep) => void;
  onComplete?: (step: CaseStep) => void;
  loading?: boolean;
}

const STATUS_STYLE: Record<StepStatus, { bg: string; color: string; label: string }> = {
  pending:  { bg: '#F1F5F9', color: '#64748B', label: 'Bekliyor' },
  active:   { bg: '#FEF3C7', color: '#D97706', label: 'Devam Ediyor' },
  done:     { bg: '#ECFDF5', color: '#059669', label: 'Tamamlandı' },
  blocked:  { bg: '#FEF2F2', color: '#DC2626', label: 'Bloke' },
};

export function StepCard({ step, onStart, onComplete, loading }: Props) {
  const ss = STATUS_STYLE[step.status];
  const icon = STEP_ICONS[step.step_name] ?? '▸';

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const durationMin = step.started_at && step.finished_at
    ? Math.round((new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()) / 60000)
    : null;

  return (
    <View style={[styles.card, { borderLeftColor: ss.color }]}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.order}>#{step.step_order}</Text>
          <Text style={styles.name}>{step.step_name.replace(/_/g, ' ')}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: ss.bg }]}>
          <Text style={[styles.badgeText, { color: ss.color }]}>{ss.label}</Text>
        </View>
      </View>

      {step.assignee && (
        <Text style={styles.meta}>👤 {step.assignee.full_name}</Text>
      )}
      {step.started_at && (
        <Text style={styles.meta}>▶ Başladı: {formatTime(step.started_at)}</Text>
      )}
      {step.finished_at && (
        <Text style={styles.meta}>
          ✓ Bitti: {formatTime(step.finished_at)}
          {durationMin !== null ? `  (${durationMin} dk)` : ''}
        </Text>
      )}
      {step.notes && <Text style={styles.notes}>{step.notes}</Text>}
      {step.requires_approval && step.status === 'done' && (
        <View style={styles.approvalNote}>
          <Text style={styles.approvalNoteText}>⏳ Onay bekleniyor</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="small" color="#2563EB" style={{ marginTop: 8 }} />
      ) : (
        <View style={styles.actions}>
          {step.status === 'pending' && onStart && (
            <TouchableOpacity style={styles.btnStart} onPress={() => onStart(step)}>
              <Text style={styles.btnStartText}>▶ Başlat</Text>
            </TouchableOpacity>
          )}
          {step.status === 'active' && onComplete && (
            <TouchableOpacity style={styles.btnDone} onPress={() => onComplete(step)}>
              <Text style={styles.btnDoneText}>✓ Tamamla</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F4F6FA', alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  info: { flex: 1 },
  order: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  name:  { fontSize: 14, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta:  { fontSize: 12, color: '#64748B', marginBottom: 3 },
  notes: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 4 },
  approvalNote: {
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 6, alignSelf: 'flex-start',
  },
  approvalNoteText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnStart: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  btnStartText: { fontSize: 13, color: '#2563EB', fontWeight: '700' },
  btnDone: {
    backgroundColor: '#ECFDF5', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  btnDoneText: { fontSize: 13, color: '#059669', fontWeight: '700' },
});
