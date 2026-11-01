// modules/delivery/proof/CloseWithoutProofModal.tsx
// Yöneticinin kendi kurye teslimatını gerekçeli olarak kanıtsız kapatması (spec 4.4).
// Neden en az 6 karakter; siparişte "Kanıtsız kapatıldı · yönetici · neden" görünür, klinik de görür.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Animated, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { X } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { overrideReasonOk } from './proofModel';
import { closeWithoutProof } from './api';
import { useAnchoredSpring, haptic, type OriginRect } from './useAnchoredSpring';
import { ReqTag } from './DeliveryProofSheet';

const NATIVE_DRIVER = Platform.OS !== 'web';
const AMBER = '#E89B2A';
const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

export function CloseWithoutProofModal({ visible, onClose, deliveryId, subtitle, origin, onClosed, demo }: {
  visible: boolean;
  onClose: () => void;
  deliveryId: string | null;
  subtitle: string;
  origin: OriginRect | null;
  onClosed: (reason: string) => void;
  /** Demo: ağ çağrısı yok. */
  demo?: boolean;
}) {
  const U = useInkUI();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const { mounted, cardStyle } = useAnchoredSpring(visible, origin);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (visible) { setReason(''); setErr(null); setBusy(false); } }, [visible]);

  const ok = overrideReasonOk(reason);
  const submit = async () => {
    if (busy) return;
    if (!ok || !deliveryId) {
      haptic(12);
      shake.setValue(-6);
      Animated.spring(shake, { toValue: 0, stiffness: 600, damping: 9, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
      return;
    }
    setBusy(true); setErr(null);
    const r = demo ? { ok: true as const } : await closeWithoutProof(deliveryId, reason.trim());
    setBusy(false);
    if (!r.ok) { setErr(autoT((r as any).error ?? 'Teslimat bulunamadı')); return; }
    haptic(14);
    onClosed(reason.trim());
    onClose();
  };

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Animated.View style={[U.modalCard, { maxWidth: 460, maxHeight: Math.round(height * 0.9), padding: 18 }, cardStyle as any]} accessibilityViewIsModal>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 20, fontWeight: '400', letterSpacing: -0.4, color: U.ink[900], fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined }}>
                {autoT('Kanıtsız kapat')}
              </Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{subtitle}</Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Teslimi kapatmadan pencereyi kapatır')} placement="bottom">
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...WEB_PTR })}>
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19, marginTop: 10 }}>
            {autoT('Kurye fotoğraf çekemediyse teslimi siz kapatabilirsiniz. Siparişte "Kanıtsız kapatıldı", adınız ve yazdığınız neden görünür; klinik de görür.')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{autoT('Neden')}</Text>
            <ReqTag state={ok ? 'ok' : 'required'} />
          </View>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            editable={!busy}
            placeholder={autoT('Örn. kuryenin telefonu kapandı, klinik telefonla teyit etti')}
            placeholderTextColor={U.ink[400]}
            style={{ ...U.inputStyle, minHeight: 84, fontSize: 16, paddingTop: 12, textAlignVertical: 'top' }}
          />

          <GlassTooltip title={autoT('Kanıtsız kapat')} text={autoT('Teslimi nedeniyle birlikte kanıtsız kapatır')} placement="top">
            <Pressable
              onPress={submit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ok || busy }}
              accessibilityLabel={autoT('Kanıtsız kapat')}
              style={({ pressed }: any) => ({
                marginTop: 14, height: 50, borderRadius: 16, backgroundColor: AMBER,
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                opacity: ok ? 1 : 0.38, transform: [{ scale: pressed && ok ? 0.97 : 1 }], ...WEB_PTR,
              })}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{autoT('Kanıtsız kapat')}</Text>
            </Pressable>
          </GlassTooltip>
          <Animated.Text
            accessibilityLiveRegion="polite"
            style={{ textAlign: 'center', marginTop: 9, minHeight: 16, fontSize: 12, color: err ? U.chipTones.danger.fg : U.ink[500], transform: [{ translateX: shake }] }}
          >
            {err ?? (ok ? '' : autoT('Nedeni yazın; klinik de görür'))}
          </Animated.Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
