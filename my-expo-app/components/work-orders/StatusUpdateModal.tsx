import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { WorkOrderStatus } from '../../lib/types';
import { STATUS_CONFIG, getNextStatus } from '../../constants/status';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import Colors from '../../constants/colors';

import { AppIcon } from '../../core/ui/AppIcon';

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
        style={styles.overlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={styles.popup}>
          <Text style={styles.title}>Durumu Güncelle</Text>

          <View style={[styles.nextBadge, { backgroundColor: nextConfig.bgColor }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppIcon name={nextConfig.ionIcon as any} size={16} color={nextConfig.color} />
              <Text style={[styles.nextBadgeText, { color: nextConfig.color }]}>{nextConfig.label}</Text>
            </View>
          </View>

          <Text style={styles.arrow}>⬆️ yeni durum</Text>

          <Input
            label="Not (isteğe bağlı)"
            value={note}
            onChangeText={setNote}
            placeholder="Ek not ekle..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />

          <View style={styles.actions}>
            <Button onPress={onClose} label="İptal" variant="outline" style={styles.actionBtn} />
            <Button
              onPress={handleConfirm}
              label="Onayla"
              loading={loading}
              style={styles.actionBtn}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  popup: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 480,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  nextBadge: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  nextBadgeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  arrow: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: { flex: 1 },
});
