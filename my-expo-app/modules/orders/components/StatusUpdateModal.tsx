import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { WorkOrderStatus } from '../types';
import { STATUS_CONFIG, getNextStatus } from '../constants';
import { C } from '../../../core/theme/colors';

import { AppIcon } from '../../../core/ui/AppIcon';

interface StatusUpdateModalProps {
  visible: boolean;
  currentStatus: WorkOrderStatus;
  onConfirm: (newStatus: WorkOrderStatus, note: string) => Promise<void>;
  onClose: () => void;
}

export function StatusUpdateModal({
  visible,
  currentStatus,
  onConfirm,
  onClose,
}: StatusUpdateModalProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const nextStatus = getNextStatus(currentStatus);
  if (!nextStatus) return null;

  const nextConfig = STATUS_CONFIG[nextStatus];

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(nextStatus, note);
    setLoading(false);
    setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.overlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={m.sheet}>

          {/* Header */}
          <View style={m.header}>
            <Text style={m.title}>Durumu Güncelle</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={m.body}>
            {/* New status */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Yeni Durum</Text>
              <View style={[m.statusBadge, { backgroundColor: nextConfig.bgColor }]}>
                <AppIcon name={nextConfig.ionIcon as any} size={18} color={nextConfig.color} />
                <Text style={[m.statusBadgeText, { color: nextConfig.color }]}>{nextConfig.label}</Text>
              </View>
            </View>

            {/* Note */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Not</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Not (isteğe bağlı)</Text>
                <TextInput
                  style={[m.fieldInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ek not ekle..."
                  placeholderTextColor="#C7C7CC"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, { backgroundColor: nextConfig.color }, loading && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={loading}
            >
              <Text style={m.saveText}>{loading ? 'Kaydediliyor...' : 'Onayla'}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Modal styles — New Order form design system ──────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 480, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15, shadowRadius: 48,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16 },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E9EEF4',
    padding: 16, marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#1E293B',
    marginBottom: 14,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  statusBadgeText: { fontSize: 15, fontWeight: '700' },
  fieldWrap: { marginBottom: 0 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
