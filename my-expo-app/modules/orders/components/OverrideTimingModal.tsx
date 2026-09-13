// modules/orders/components/OverrideTimingModal.tsx
// Manager-only timing düzeltme modalı.
// Belirli bir stage timing alanını (active/machine/queue/operator_setup) yeni
// dakika değeriyle override eder. Sebep zorunlu, audit log'a yazılır.

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import { X, Settings, AlertCircle } from '../../../core/ui/icons';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { toast } from '../../../core/ui/Toast';
import { overrideStageTiming } from '../api/timing';
import { formatDuration } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

export type OverridableField =
  | 'active_work_seconds'
  | 'machine_runtime_seconds'
  | 'operator_setup_seconds'
  | 'queue_waiting_seconds';

const FIELD_LABEL: Record<OverridableField, string> = {
  active_work_seconds:    'Operatör aktif süresi',
  machine_runtime_seconds:'Makine çalışma süresi',
  operator_setup_seconds: 'Hazırlık süresi',
  queue_waiting_seconds:  'Kuyruk bekleme süresi',
};

const FIELD_HINT: Record<OverridableField, string> = {
  active_work_seconds:    'Net çalışma süresi (pause çıkarılmış).',
  machine_runtime_seconds:'Makinenin runtime süresi.',
  operator_setup_seconds: 'Frez takma, makineye yükleme vb.',
  queue_waiting_seconds:  'Stage bekliyor durumunda geçen süre.',
};

export function OverrideTimingModal({
  visible, stageId, field, currentSeconds, onClose, onSaved,
}: {
  visible:        boolean;
  stageId:        string | null;
  field:          OverridableField | null;
  currentSeconds: number;
  onClose:        () => void;
  onSaved?:       () => void;
}) {
  const P = useStationTheme();
  const [minutesStr, setMinutesStr] = useState('');
  const [reason,     setReason]     = useState('');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Açılışta mevcut dakika ile preset'le
      setMinutesStr(currentSeconds > 0 ? String(Math.round(currentSeconds / 60)) : '');
      setReason('');
      setError(null);
    }
  }, [visible, currentSeconds]);

  if (!visible || !stageId || !field) return null;

  const newSeconds = (() => {
    const m = parseFloat(minutesStr.replace(',', '.'));
    if (Number.isNaN(m) || m < 0) return null;
    return Math.round(m * 60);
  })();

  const reasonValid  = reason.trim().length >= 3;
  const valueValid   = newSeconds !== null;
  const canSubmit    = reasonValid && valueValid && !busy;

  async function handleSave() {
    if (!canSubmit || !stageId || !field || newSeconds === null) return;
    setBusy(true);
    setError(null);
    const res = await overrideStageTiming(stageId, field, newSeconds, reason.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Kaydedilemedi');
      return;
    }
    toast.success('Süre düzeltildi · audit kaydı oluşturuldu');
    onSaved?.();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1, alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)',
          padding: 16,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 460,
            backgroundColor: P.surface, borderRadius: 18,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.20)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: P.ink100,
            backgroundColor: P.surfaceAlt,
            flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hexA('#EA580C', 0.12),
            }}>
              <Settings size={15} color="#EA580C" strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: P.ink900 }}>
                Süreyi Düzelt
              </Text>
              <Text style={{ fontSize: 11, color: P.ink500, marginTop: 1 }}>
                {FIELD_LABEL[field]}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={16} color={P.ink400} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {/* Body */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 18, gap: 16 }}>
              {/* Mevcut */}
              <View style={{
                paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10,
                backgroundColor: P.surfaceAlt, borderWidth: 1, borderColor: P.ink100,
              }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                  Mevcut Değer
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink900, marginTop: 2 }}>
                  {formatDuration(currentSeconds)} <Text style={{ fontSize: 11, color: P.ink400, fontWeight: '500' }}>({currentSeconds}sn)</Text>
                </Text>
                <Text style={{ fontSize: 11, color: P.ink500, marginTop: 4, lineHeight: 16 }}>
                  {FIELD_HINT[field]}
                </Text>
              </View>

              {/* Yeni dakika input */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Yeni Değer (dakika)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    value={minutesStr}
                    onChangeText={setMinutesStr}
                    placeholder="örn 45"
                    placeholderTextColor={P.ink300}
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1,
                      borderWidth: 1, borderColor: P.ink100, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 14, color: P.ink900, backgroundColor: P.surface,
                      // @ts-ignore web outline
                      outlineWidth: 0,
                    }}
                  />
                  <Text style={{ fontSize: 12, color: P.ink500 }}>dakika</Text>
                </View>
                {newSeconds !== null && newSeconds !== currentSeconds && (
                  <Text style={{ fontSize: 11, color: P.ink500 }}>
                    {currentSeconds < newSeconds
                      ? `+${formatDuration(newSeconds - currentSeconds)} eklenir`
                      : `${formatDuration(currentSeconds - newSeconds)} azaltılır`}
                  </Text>
                )}
              </View>

              {/* Reason */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Sebep <Text style={{ color: '#DC2626' }}>*</Text>
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Neden düzeltildi? (audit'e yazılacak)"
                  placeholderTextColor={P.ink300}
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1, borderColor: P.ink100, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 10,
                    fontSize: 13, color: P.ink900, backgroundColor: P.surface,
                    minHeight: 64, textAlignVertical: 'top',
                    // @ts-ignore web outline
                    outlineWidth: 0,
                  }}
                />
                {!reasonValid && reason.length > 0 && (
                  <Text style={{ fontSize: 11, color: P.warning }}>
                    En az 3 karakter
                  </Text>
                )}
              </View>

              {/* Audit warning */}
              <View style={{
                flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                backgroundColor: hexA('#EA580C', 0.06),
                borderWidth: 1, borderColor: hexA('#EA580C', 0.22),
              }}>
                <AlertCircle size={13} color="#EA580C" strokeWidth={1.8} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11.5, color: '#7C2D12', lineHeight: 16 }}>
                  Bu işlem <Text style={{ fontWeight: '700' }}>stage_timing_overrides</Text> tablosuna kim/ne zaman/eski/yeni değer ile audit'lenir. Geri alınmaz.
                </Text>
              </View>

              {error && (
                <View style={{
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: hexA('#DC2626', 0.30),
                }}>
                  <Text style={{ fontSize: 12, color: '#7F1D1D' }}>{error}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', gap: 10,
            paddingHorizontal: 16, paddingVertical: 12,
            borderTopWidth: 1, borderTopColor: P.ink100,
            backgroundColor: P.surfaceAlt,
          }}>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1, paddingVertical: 11, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: P.surface,
                borderWidth: 1, borderColor: P.ink100,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink700 }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSubmit}
              style={{
                flex: 1.5, paddingVertical: 11, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 7,
                backgroundColor: canSubmit ? '#EA580C' : P.ink100,
                opacity: busy ? 0.7 : 1,
                ...(Platform.OS === 'web' ? { cursor: canSubmit ? 'pointer' : 'not-allowed' } as any : {}),
              }}
            >
              <Settings size={13} color={canSubmit ? '#FFFFFF' : P.ink400} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: canSubmit ? '#FFFFFF' : P.ink400, letterSpacing: 0.3 }}>
                {busy ? 'Kaydediliyor...' : 'Düzeltmeyi Kaydet'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
