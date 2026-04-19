import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Approval } from '../types';
import { useApprove } from '../hooks/useApprove';
import { STEP_ICONS, MANUAL_STEPS, DIGITAL_STEPS } from '../../workflow/templates';

const STEP_LABELS: Record<string, string> = Object.fromEntries(
  [...MANUAL_STEPS, ...DIGITAL_STEPS].map(s => [s.name, s.label])
);

interface Props {
  approval: Approval;
  onResolved?: () => void;
  canApprove?: boolean; // true only for admin
}

const STATUS_CFG = {
  pending:  { label: 'Bekliyor',   bg: '#FEF3C7', color: '#D97706' },
  approved: { label: 'Onaylandı',  bg: '#ECFDF5', color: '#059669' },
  rejected: { label: 'Reddedildi', bg: '#FEF2F2', color: '#DC2626' },
};

export function ApprovalCard({ approval, onResolved, canApprove = false }: Props) {
  const { approve, reject, loading } = useApprove();
  const [showReject, setShowReject]  = useState(false);
  const [reason, setReason]          = useState('');
  const sc   = STATUS_CFG[approval.status];
  const icon = STEP_ICONS[approval.step_name] ?? '⏳';

  const stepLabel = STEP_LABELS[approval.step_name] ?? approval.step_name.replace(/_/g, ' ');

  const handleApprove = async () => {
    const ok = await approve(approval.id);
    if (ok) onResolved?.();
    else Alert.alert('Hata', 'Onaylanamadı');
  };

  const handleReject = async () => {
    if (!reason.trim()) { Alert.alert('Hata', 'Red gerekçesi giriniz'); return; }
    const ok = await reject(approval.id, reason);
    if (ok) onResolved?.();
    else Alert.alert('Hata', 'Reddedilemedi');
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.info}>
          <Text style={styles.stepName}>{stepLabel}</Text>
          <Text style={styles.requester}>
            Talep: {approval.requester?.full_name ?? '—'}
          </Text>
          <Text style={styles.date}>
            {new Date(approval.requested_at).toLocaleDateString('tr-TR')}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.badgeText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      {approval.status === 'rejected' && approval.rejection_reason && (
        <View style={styles.rejectNote}>
          <Text style={styles.rejectNoteText}>❌ {approval.rejection_reason}</Text>
        </View>
      )}

      {approval.status === 'approved' && approval.approver && (
        <Text style={styles.resolvedBy}>✅ Onaylayan: {approval.approver.full_name}</Text>
      )}

      {canApprove && approval.status === 'pending' && !showReject && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnApprove}
            onPress={handleApprove}
            disabled={loading}
          >
            <Text style={styles.btnApproveText}>✓ Onayla</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnReject}
            onPress={() => setShowReject(true)}
            disabled={loading}
          >
            <Text style={styles.btnRejectText}>✕ Reddet</Text>
          </TouchableOpacity>
        </View>
      )}

      {showReject && (
        <View style={styles.rejectForm}>
          <TextInput
            style={styles.rejectInput}
            placeholder="Red gerekçesi..."
            placeholderTextColor="#94A3B8"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={styles.rejectActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={() => setShowReject(false)}>
              <Text style={styles.btnCancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnConfirmReject} onPress={handleReject} disabled={loading}>
              <Text style={styles.btnConfirmRejectText}>Reddet</Text>
            </TouchableOpacity>
          </View>
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
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon:   { fontSize: 24, marginTop: 2 },
  info:   { flex: 1 },
  stepName:  { fontSize: 14, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize' },
  requester: { fontSize: 12, color: '#64748B', marginTop: 2 },
  date:      { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  rejectNote: {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    padding: 8, marginTop: 8,
  },
  rejectNoteText: { fontSize: 12, color: '#DC2626' },
  resolvedBy: { fontSize: 12, color: '#059669', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove: {
    flex: 1, backgroundColor: '#ECFDF5', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  btnApproveText: { fontSize: 13, color: '#059669', fontWeight: '700' },
  btnReject: {
    flex: 1, backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  btnRejectText: { fontSize: 13, color: '#DC2626', fontWeight: '700' },
  rejectForm: { marginTop: 10 },
  rejectInput: {
    backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1,
    borderColor: '#F1F5F9', padding: 10, fontSize: 13,
    color: '#0F172A', minHeight: 60,
  },
  rejectActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnCancel: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  btnCancelText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  btnConfirmReject: {
    flex: 1, backgroundColor: '#DC2626', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  btnConfirmRejectText: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
});
