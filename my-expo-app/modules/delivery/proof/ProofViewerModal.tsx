// modules/delivery/proof/ProofViewerModal.tsx
// "Teslim kanıtı" görüntüleyici (spec 4.7): büyük fotoğraf, imza (ya da "İmza alınamadı" + neden),
// Teslim alan / Saat / Kurye. Kanıt satırının küçük resminden büyüyerek açılır, oraya kapanır.
import React from 'react';
import { View, Text, Pressable, Modal, Image, ScrollView, Platform, Animated, useWindowDimensions } from 'react-native';
import { X } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { proofKindOf, needsSignature } from './proofModel';
import { useAnchoredSpring, type OriginRect } from './useAnchoredSpring';
import { useProofUrls, hhmm, type ProofLeg } from './ProofRow';
import { PAPER } from './signatureInk';

// Kart ScrollView içinde hareket eder (uzun içerikte kaydırılabilir kalsın)
const AnimatedCard = Animated.View;

const fullStamp = (iso?: string | null) =>
  iso ? `${new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' })} · ${hhmm(iso)}` : '—';

export function ProofViewerModal({ visible, onClose, leg, origin, orderNumber }: {
  visible: boolean;
  onClose: () => void;
  leg: ProofLeg | null;
  origin: OriginRect | null;
  orderNumber?: string | null;
}) {
  const U = useInkUI();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const { mounted, cardStyle } = useAnchoredSpring(visible, origin);
  const urls = useProofUrls(leg ? [leg.proof_photo_path, leg.signature_path] : []);
  if (!mounted || !leg) return null;

  const kind = proofKindOf(leg);
  const photo = leg.proof_photo_path ? urls[leg.proof_photo_path] : undefined;
  const sig = leg.signature_path ? urls[leg.signature_path] : undefined;
  const provider = kind === 'provider';
  const toLab = leg.direction === 'clinic_to_lab' || leg.direction === 'other_to_lab';
  const subtitle = [toLab ? autoT("Lab'a teslim") : autoT('Kliniğe teslim'), orderNumber ? `#${orderNumber}` : null].filter(Boolean).join(' · ');
  const courier = leg.ext_courier_name
    ? `${leg.external_provider ?? 'BanaBiKurye'} · ${leg.ext_courier_name}`
    : (leg.courier?.full_name ?? leg.external_provider ?? '—');

  const Row = ({ k, v }: { k: string; v: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: U.hairline }}>
      <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT(k)}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] }}>{v}</Text>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <ScrollView
          style={{ width: '100%', maxWidth: 480, maxHeight: Math.round(height * 0.92), flexGrow: 0 }}
          contentContainerStyle={{ flexGrow: 0 }}
        >
          <View>
            {/* Kart tek parça hareket eder (aynı yay) */}
            <AnimatedCard style={[U.modalCard, { maxWidth: 480, padding: 18 }, cardStyle as any]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 20, fontWeight: '400', letterSpacing: -0.4, color: U.ink[900], fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined }}>
                    {autoT('Teslim kanıtı')}
                  </Text>
                  <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{subtitle}</Text>
                </View>
                <GlassTooltip title={autoT('Kapat')} text={autoT('Kanıt penceresini kapatır')} placement="bottom">
                  <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                    style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null) })}>
                    <X size={15} color={U.ink[500]} strokeWidth={2} />
                  </Pressable>
                </GlassTooltip>
              </View>

              {leg.proof_photo_path ? (
                <View style={{ aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', backgroundColor: U.chipNeutral }}>
                  {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                </View>
              ) : provider ? (
                <View style={{ padding: 12, borderRadius: 14, backgroundColor: U.surfaceSoft }}>
                  <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
                    {autoT('BanaBiKurye fotoğraf ve imza göndermedi; teslim alanın adı ve varış saati geldi.')}
                  </Text>
                </View>
              ) : null}

              {needsSignature(leg.direction) && kind === 'nosig' ? (
                <View style={{ marginTop: 10, minHeight: 96, borderRadius: 18, borderWidth: 1, borderColor: U.hairline, backgroundColor: U.chipTones.warning.bg, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.chipTones.warning.fg }}>{autoT('İmza alınamadı')}</Text>
                  {leg.signature_skipped_reason ? <Text style={{ fontSize: 12.5, color: U.ink[500], marginTop: 4, textAlign: 'center' }}>{autoT(leg.signature_skipped_reason)}</Text> : null}
                </View>
              ) : leg.signature_path ? (
                <View style={{ marginTop: 10, height: 112, borderRadius: 18, borderWidth: 1, borderColor: U.hairline, backgroundColor: PAPER, overflow: 'hidden' }}>
                  {sig ? <Image source={{ uri: sig }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
                </View>
              ) : null}

              {provider ? (
                <View style={{ alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: U.chipTones.info.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: U.chipTones.info.fg }}>{autoT("Kanıt BanaBiKurye'den geldi")}</Text>
                </View>
              ) : null}

              <View style={{ marginTop: 10 }}>
                {needsSignature(leg.direction) ? (
                  <Row k="Teslim alan" v={leg.recipient_name ? `${leg.recipient_name}${leg.recipient_title ? ` · ${leg.recipient_title}` : ''}` : '—'} />
                ) : null}
                <Row k="Saat" v={fullStamp(leg.proof_captured_at ?? leg.delivered_at)} />
                <Row k="Kurye" v={courier} />
              </View>
            </AnimatedCard>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
