// modules/orders/components/ShipLabelTypeModal.tsx
// Lojistik kartı başlığındaki "Teslimat belgesi" yazdır düğmesinin sorusu:
// hangi teslimat türü için? Kurye kaydı gerekmez — belge seçilen amacın doğal
// yönüyle (shipLabel.PURPOSE_DEFAULT_DIRECTION) klinik/lab kaydından üretilir.
// Aynı sipariş için istenildiği kadar, her seferinde başka türle basılabilir.
//
// Tasarım: karttaki kardeş pencerelerle (kanıt görüntüleyici, kanıtsız kapat)
// aynı kalıp — tetikleyiciden yayla açılır, aynı yoldan oraya kapanır. Türler
// yöne göre iki gömülü grupta: yön satır satır tekrarlanmaz, grubun başlığıdır.

import React from 'react';
import { View, Text, Pressable, Modal, Animated, Platform, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { X, ChevronLeft, ChevronRight } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useAnchoredSpring, haptic, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../api';

/** Yöne göre gruplar — kurye çağırma penceresindeki amaçlarla aynı 7 tür. */
const GROUPS: { title: string; route: string; purposes: DeliveryPurpose[] }[] = [
  { title: 'Labdan çıkan', route: 'Lab → Klinik', purposes: ['teslimat', 'prova_gidis', 'diger'] },
  { title: 'Laba gelen',   route: 'Klinik → Lab', purposes: ['prova_donus', 'model_alma', 'eksik_parca', 'iade'] },
];

const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;
const DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined;

interface Props {
  visible: boolean;
  onClose: () => void;
  accent: string;
  /** Pencerenin büyüdüğü tetikleyici (başlıktaki yazıcı düğmesi). */
  origin?: OriginRect | null;
  /** Alt başlık: sipariş no. */
  orderNumber?: string | null;
  /** Belgeyi hazırlayıp yazdırır; başarısızsa fırlatır (hata pencerede gösterilir). */
  onPick: (purpose: DeliveryPurpose) => Promise<void>;
}

export function ShipLabelTypeModal({ visible, onClose, accent, origin = null, orderNumber = null, onPick }: Props) {
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const { mounted, cardStyle } = useAnchoredSpring(visible, origin);
  const [busy, setBusy] = React.useState<DeliveryPurpose | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (visible) { setBusy(null); setError(null); } }, [visible]);

  // Koyu accent (admin laciverti) koyu kartta okunmaz → açık mavi.
  const accentFg = isDark ? '#93C5FD' : accent;
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;
  const close = () => { if (!busy) onClose(); };

  const pick = async (p: DeliveryPurpose) => {
    if (busy) return;
    setError(null);
    setBusy(p);
    try {
      await onPick(p);
      haptic(10);
      onClose();
    } catch {
      setError(autoT('Belge hazırlanamadı. Tekrar deneyin.'));
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable onPress={close} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Animated.View
          style={[U.modalCard, { maxWidth: 380, maxHeight: Math.round(height * 0.9), padding: 18 }, cardStyle as any]}
          accessibilityViewIsModal
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 20, fontWeight: '400', letterSpacing: -0.4, color: U.ink[900], fontFamily: DISPLAY_FONT }}>
                {autoT('Teslimat belgesi')}
              </Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                {[autoT('Teslimat türünü seçin'), orderNumber ? `#${orderNumber}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Belge basmadan pencereyi kapatır')} placement="bottom">
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...WEB_PTR })}>
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false}>
            {GROUPS.map(g => (
              <View key={g.title} style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 7 }}>
                  <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400] }}>
                    {autoT(g.title)}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[400] }}>{autoT(g.route)}</Text>
                </View>
                <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? U.surfaceSoft : '#F5F5F5' }}>
                  {g.purposes.map((p, i) => {
                    const isBusy = busy === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => pick(p)}
                        disabled={!!busy}
                        accessibilityRole="button"
                        accessibilityLabel={`${autoT(DELIVERY_PURPOSE_LABELS[p])} · ${autoT(g.route)}`}
                        style={({ hovered, pressed }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          minHeight: 48, paddingHorizontal: 14,
                          // Basıldığı anda cevap verir (bırakmayı beklemez); ölçek değil zemin — liste satırı.
                          backgroundColor: pressed || isBusy ? U.chipNeutral : hovered ? U.rowHover : 'transparent',
                          opacity: busy && !isBusy ? 0.4 : 1,
                          ...(busy ? null : WEB_PTR),
                        })}
                      >
                        {i > 0 ? (
                          <View style={{ position: 'absolute', top: 0, left: 14, right: 0, height: 1, backgroundColor: U.hairline }} />
                        ) : null}
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.1, color: U.ink[900] }} numberOfLines={1}>
                          {autoT(DELIVERY_PURPOSE_LABELS[p])}
                        </Text>
                        {isBusy
                          ? <ActivityIndicator size="small" color={accentFg} />
                          : <Chevron size={15} color={U.ink[300]} strokeWidth={2} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text
              accessibilityLiveRegion="polite"
              style={{ fontSize: 12, lineHeight: 17, marginTop: 12, paddingHorizontal: 4, color: error ? U.chipTones.danger.fg : U.ink[400] }}
            >
              {error ?? autoT('Kurye çağırmadan da basılır. Kurye ve takip numarası yalnız kurye hareketinin kendi fişinde yer alır.')}
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
