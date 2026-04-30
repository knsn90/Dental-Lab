// modules/orders/components/QCRejectModal.tsx
// QC reject — sebep + dönüş stage'i seçimi. Submit edince:
// - reject_log + rework_count++
// - Önceki owner (stage_log) yoksa auto_assign
// - Yeni 'aktif' order_stages satırı
// (Tümü return_to_stage RPC içinde)

import React, { useState } from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../stages';

interface Props {
  visible:        boolean;
  workOrderId:    string;
  rejectedBy:     string;
  /** Geri dönülebilir aşamalar — genelde mevcut stage'ten önceki tüm aşamalar */
  availableStages: Stage[];
  onClose:        () => void;
  onDone:         () => void;     // refetch tetikle
}

export function QCRejectModal({
  visible, workOrderId, rejectedBy, availableStages, onClose, onDone,
}: Props) {
  const [toStage, setToStage] = useState<Stage | null>(null);
  const [reason,  setReason]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!toStage) { toast.error('Dönüş aşamasını seç'); return; }
    if (!reason.trim()) { toast.error('Sebep zorunlu'); return; }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('return_to_stage', {
      p_work_order_id: workOrderId,
      p_to_stage:      toStage,
      p_reason:        reason.trim(),
      p_rejected_by:   rejectedBy,
    });
    setSubmitting(false);
    if (error) { toast.error('Red işlemi: ' + error.message); return; }
    const r = data as any;
    if (!r?.ok) { toast.error('Red başarısız'); return; }
    toast.success(`${STAGE_LABEL[toStage]} aşamasına geri gönderildi`);
    onDone();
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation?.()}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <AppIcon name="x" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>QC Red — Geri Gönder</Text>
              <Text style={s.subtitle}>Sebep + dönüş aşaması zorunlu</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {/* Dönüş aşaması */}
            <Text style={s.fieldLabel}>Dönüş Aşaması</Text>
            <View style={s.stageGrid}>
              {availableStages.map(st => {
                const active = toStage === st;
                const color  = STAGE_COLOR[st];
                return (
                  <TouchableOpacity
                    key={st}
                    onPress={() => setToStage(st)}
                    activeOpacity={0.75}
                    style={[
                      s.stageChip,
                      active && { backgroundColor: color, borderColor: color },
                    ]}
                  >
                    <Text style={[s.stageChipText, active && { color: '#FFFFFF' }]}>
                      {STAGE_LABEL[st]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sebep */}
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>Sebep (zorunlu)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              placeholder="Hangi sorun var? Ne düzeltilecek?"
              placeholderTextColor="#94A3B8"
              style={s.input}
            />
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7} disabled={submitting}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={[s.submitBtn, (!toStage || !reason.trim() || submitting) && { opacity: 0.5 }]}
              disabled={!toStage || !reason.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={s.submitText}>Geri Gönder</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 8 },

  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stageChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  stageChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  input: {
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 12, fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
    textAlignVertical: 'top',
  },

  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  cancelText:{ fontSize: 13, fontWeight: '600', color: '#475569' },
  submitBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' },
  submitText:{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});

export default QCRejectModal;
