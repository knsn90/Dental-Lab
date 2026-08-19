import { localeTag, isRTL } from '../../../core/i18n';
// modules/orders/components/StageCompletionPopup.tsx
// Aşama tamamlama popup — DeltaBiome tarzı hero + bilgi kartı + CTA.
// Patterns sayfasındaki dil: PillButton, Chip, SecHeader stilleri + tech-blue accent.

import React from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import { Check, ArrowRight, ArrowLeft, X } from 'lucide-react-native';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';

const SERIF = {
  fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light',
  fontWeight: '300' as const,
};

export interface StageCompletionInfo {
  stationName: string | null;
  orderNumber: string;
  patientName: string | null;
  sequenceOrder: number;
  completedAt: Date;
  nextStationName?: string | null;
  isOrderDone?: boolean;
}

export function StageCompletionPopup({
  visible, info, onClose,
}: {
  visible: boolean;
  info: StageCompletionInfo | null;
  onClose: () => void;
}) {
  const P = useStationTheme();
  if (!info) return null;

  const dateStr = info.completedAt.toLocaleDateString(localeTag(), {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeStr = info.completedAt.toLocaleTimeString(localeTag(), {
    hour: '2-digit', minute: '2-digit',
  });

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
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } as any : {}),
      }}>
        <View style={{
          width: '100%', maxWidth: 560,
          backgroundColor: P.surface,
          borderRadius: 24,
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.28)' } as any : {}),
        }}>
          {/* HERO — tech-blue gradient */}
          <View style={{
            paddingHorizontal: 28, paddingTop: 32, paddingBottom: 36,
            position: 'relative',
            backgroundColor: P.ctaBg,
            ...(Platform.OS === 'web'
              ? { backgroundImage: `linear-gradient(135deg, ${P.accentDeep} 0%, ${P.ctaBg} 100%)` } as any
              : {}),
          }}>
            {/* Close X (sağ-üst) */}
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                position: 'absolute', top: 14, end: 14,
                width: 32, height: 32, borderRadius: 16,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.12)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <X size={16} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </Pressable>

            {/* Check ikonu — yuvarlak */}
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: '#FBBF24',
                alignItems: 'center', justifyContent: 'center',
                ...(Platform.OS === 'web'
                  ? { boxShadow: `0 8px 24px ${hexA('#FBBF24', 0.35)}` } as any
                  : {}),
              }}>
                <Check size={36} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>

            {/* Başlık */}
            <Text style={{
              ...SERIF, fontSize: 28,
              color: '#FFFFFF',
              letterSpacing: -0.8, lineHeight: 32,
              textAlign: 'center',
            }}>
              {info.isOrderDone ? 'Sipariş tamamlandı,' : 'Aşama tamamlandı,'}
            </Text>
            <Text style={{
              ...SERIF, fontSize: 28,
              color: '#FFFFFF',
              letterSpacing: -0.8, lineHeight: 32,
              textAlign: 'center',
              marginTop: 2,
            }}>
              {info.isOrderDone ? 'kalite kontrole gönderildi' : 'sıradakine geçildi'}
            </Text>

            {/* Açıklama */}
            <Text style={{
              fontSize: 13, color: 'rgba(255,255,255,0.75)',
              textAlign: 'center', marginTop: 14, lineHeight: 18,
              maxWidth: 420, alignSelf: 'center',
            }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>#{info.orderNumber}</Text>
              {' '}siparişinin{' '}
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{info.stationName ?? '—'}</Text>
              {' '}aşaması başarıyla tamamlandı.
              {info.isOrderDone
                ? ' Tüm üretim aşamaları bitti — sipariş kalite kontrol için yöneticiye gönderildi.'
                : info.nextStationName
                  ? ` Sıradaki aşama: ${info.nextStationName}.`
                  : ''}
            </Text>
          </View>

          {/* BODY — bilgi kartları */}
          <View style={{ padding: 24, gap: 16 }}>
            {/* Order bilgileri grid */}
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap',
              borderRadius: 14,
              borderWidth: 1, borderColor: P.ink100,
              overflow: 'hidden',
            }}>
              <InfoCell label="Sipariş No" value={`#${info.orderNumber}`} half />
              <InfoCell label="Tamamlama" value={dateStr} half />
              <InfoCell label="Aşama"     value={info.stationName ?? '—'} half borderTop />
              <InfoCell label="Saat"      value={timeStr} half borderTop />
            </View>

            {/* Hasta + sequence chip */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
              backgroundColor: hexA(P.accent, 0.06),
              borderWidth: 1, borderColor: hexA(P.accent, 0.14),
            }}>
              <View>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.accentDeep, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Hasta
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900, marginTop: 2 }} numberOfLines={1}>
                  {info.patientName ?? 'Belirtilmemiş'}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                backgroundColor: P.accent,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
                  AŞAMA #{info.sequenceOrder}
                </Text>
              </View>
            </View>
          </View>

          {/* FOOTER — CTA */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24,
          }}>
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
                backgroundColor: hovered ? P.ink100 : P.surface,
                borderWidth: 1, borderColor: P.ink100,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: P.ink700, letterSpacing: 0.3 }}>
                Kapat
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
                backgroundColor: hovered ? P.accentDeep : P.accent,
                ...(Platform.OS === 'web'
                  ? { cursor: 'pointer', boxShadow: `0 6px 18px ${hexA(P.accent, 0.32)}` } as any
                  : {}),
              })}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                İşlerime Dön
              </Text>
              {isRTL()
                ? <ArrowLeft size={14} color="#FFFFFF" strokeWidth={2.4} />
                : <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.4} />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoCell({
  label, value, half, borderTop,
}: {
  label: string;
  value: string;
  half?: boolean;
  borderTop?: boolean;
}) {
  const P = useStationTheme();
  return (
    <View style={{
      width: half ? '50%' : '100%',
      paddingHorizontal: 14, paddingVertical: 12,
      borderTopWidth: borderTop ? 1 : 0,
      borderTopColor: P.ink100,
    }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900, marginTop: 3 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
