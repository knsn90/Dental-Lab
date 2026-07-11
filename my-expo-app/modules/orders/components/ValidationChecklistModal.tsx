// modules/orders/components/ValidationChecklistModal.tsx
// "Tamamla" butonuna basıldığında açılan popup — checklist + Onayla CTA.
// Önceden inline duruyordu; şimdi popup tarzında.

import React from 'react';
import { Modal, View, Text, Pressable, Platform, ScrollView} from 'react-native';
import { X, Check, ShieldCheck } from 'lucide-react-native';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { StageValidationChecklist } from './StageValidationChecklist';
import type { ValidationItem as VI } from '../stations/registry';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

export function ValidationChecklistModal({
  visible, items, checked, onToggle, onConfirm, onClose,
  stationName, ctaLabel, submitting,
}: {
  visible:     boolean;
  items:       VI[];
  checked:     Set<string>;
  onToggle:    (key: string) => void;
  onConfirm:   () => void;
  onClose:     () => void;
  stationName: string | null;
  ctaLabel:    string;
  submitting:  boolean;
}) {
  const P = useStationTheme();
  const required = items.filter(i => i.required !== false);
  const requiredDone = required.every(i => checked.has(i.key));
  const canConfirm = requiredDone && !submitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center', justifyContent: 'center',
        padding: 20,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(4px)' } as any : {}),
      }}>
        <View style={{
          width: '100%', maxWidth: 520,
          backgroundColor: P.surface,
          borderRadius: 20,
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 48px rgba(0,0,0,0.25)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: P.ink100,
            backgroundColor: 'transparent',
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 11,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hexA(P.accent, 0.12),
              borderWidth: 1, borderColor: hexA(P.accent, 0.25),
            }}>
              <ShieldCheck size={17} color={P.accent} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900, letterSpacing: -0.2 }}>
                Aşama Kontrol Listesi
              </Text>
              <Text style={{ fontSize: 11.5, color: P.ink500, marginTop: 1 }} numberOfLines={1}>
                {stationName ?? '—'} · tamamlamadan önce kontrol et
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                width: 32, height: 32, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? P.ink100 : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <X size={16} color={P.ink500} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Body — checklist */}
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16 }}>
            <StageValidationChecklist
              items={items}
              checked={checked}
              onToggle={onToggle}
              embedded
            />
          </ScrollView>

          {/* Footer — CTA */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: P.ink100,
            backgroundColor: 'transparent',
          }}>
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                backgroundColor: hovered ? P.ink100 : P.surface,
                borderWidth: 1, borderColor: P.ink100,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: P.ink700 }}>
                Vazgeç
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={canConfirm ? onConfirm : undefined}
              disabled={!canConfirm}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12,
                backgroundColor: canConfirm ? P.ctaBg : P.ink100,
                opacity: submitting ? 0.6 : 1,
                ...(Platform.OS === 'web' ? {
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  boxShadow: canConfirm ? `0 6px 18px ${hexA(P.ctaBg, 0.32)}` : 'none',
                } as any : {}),
              }}
            >
              <Check size={14} color={canConfirm ? P.ctaInk : P.ink400} strokeWidth={2.5} />
              <Text style={{
                fontSize: 12.5, fontWeight: '700',
                color: canConfirm ? P.ctaInk : P.ink400,
                letterSpacing: 0.4, textTransform: 'uppercase',
              }}>
                {requiredDone ? ctaLabel : `${required.filter(i => checked.has(i.key)).length}/${required.length} kontrol`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
