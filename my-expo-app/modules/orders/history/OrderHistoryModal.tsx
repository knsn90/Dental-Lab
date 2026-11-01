/**
 * OrderHistoryModal — sipariş "Geçmiş" popup'ı.
 *
 * Uygulama popup kalıbı: useInkUI().modalOverlay (bulanık zemin) + modalCard + modalHeaderRow.
 * Masaüstünde ve mobilde sayfanın ORTASINDA açılır — diğer popup'larla aynı (kullanıcı kararı:
 * alttan açılan sayfa değil). Dar ekranda dış boşluk 12 (ClinicReceiptModal kalıbı).
 * Hareket: kart açılırken kritik sönümlü yayla yerine oturur (taşma yok), kapanırken geldiği
 * yoldan döner; sistemde "hareketi azalt" açıksa yalnız solma. İçerik yalnız açıkken bağlanır →
 * order_history sorgusu ve canlı kanal yalnız popup açıkken çalışır.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, Animated, Easing, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { X, History } from '../../../core/ui/icons';
import { OrderHistoryTimeline } from './OrderHistoryTimeline';

const NATIVE_DRIVER = Platform.OS !== 'web';

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduce(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

export function OrderHistoryModal({ visible, onClose, orderId, orderNumber }: {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string | null;
}) {
  const U = useInkUI();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  // 0 = yerinde, 1 = dışarıda
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.setValue(1);
      if (reduce) {
        Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
      } else {
        // Kritik sönümlü yay: response ≈ 2π/√(k/m) ≈ 0.35 sn, sönüm oranı 1 (taşma yok)
        Animated.spring(progress, { toValue: 0, stiffness: 320, damping: 36, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
      }
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 1, duration: reduce ? 120 : 200, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const travel = reduce ? 0 : 24;
  const cardStyle = {
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) },
                ...(reduce ? [] : [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }])],
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  };
  const cardH = narrow ? Math.round(height * 0.84) : Math.min(760, Math.round(height * 0.86));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        {/* Kartın dışına dokununca kapanır */}
        <Pressable
          onPress={onClose}
          accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(Platform.OS === 'web' ? { cursor: 'default' } as any : null) }}
        />
        <Animated.View
          style={[
            U.modalCard,
            { maxWidth: 640, height: cardH },
            cardStyle as any,
          ]}
          accessibilityViewIsModal
        >
          <View style={[U.modalHeaderRow, { borderBottomWidth: 0, paddingBottom: 4, gap: 12 }]}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.neutral.bg }}>
              <History size={17} color={U.ink[700]} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[U.modalTitle, { letterSpacing: -0.2 }]} numberOfLines={1}>{autoT('Sipariş geçmişi')}</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                {orderNumber ? `#${orderNumber} · ` : ''}{autoT('Kim, ne zaman, ne yaptı')}
              </Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Geçmiş penceresini kapatır')} placement="bottom">
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({
                  ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                })}
              >
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>
          <OrderHistoryTimeline orderId={orderId} />
        </Animated.View>
      </View>
    </Modal>
  );
}

export default OrderHistoryModal;
