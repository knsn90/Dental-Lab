// PendingReviewsCard — teslim edilmiş ama değerlendirilmemiş işler (Faz 2).
// Tasarım: admin panelindeki "Acil / Planlama bekliyor" banner'ıyla aynı dil
// (gradient + glow + ikon dairesi + kicker + büyük sayı + ok çipi), panel temalı.
// Tıklayınca bekleyen işleri SIRAYLA değerlendirme modalı açılır.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';
import { Star, ArrowUpRight, ArrowUpLeft } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { AlertPillX } from '../../../core/ui/AlertPillX';
import { listMyPendingReviews } from '../api';
import { ReviewModal } from './ReviewModal';
import type { PendingReviewOrder } from '../types';

export function PendingReviewsCard({
  raterRole,
  compact = false,
  onCount,
}: {
  raterRole?: 'doctor' | 'clinic' | null;
  /** true → tam genişlikte banner yerine tek satırlık pill (bkz. AlertPillX). */
  compact?: boolean;
  /** Bekleyen sayısını dışarı bildirir; çağıran satır boşluğunu buna göre ayarlar. */
  onCount?: (n: number) => void;
}) {
  const T = usePanelTheme();
  const [items, setItems] = useState<PendingReviewOrder[]>([]);
  const [active, setActive] = useState<PendingReviewOrder | null>(null);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [glowAnim]);

  // ref üzerinden: çağıran inline arrow geçtiğinde load()'un kimliği değişip
  // effect'i her render'da yeniden tetiklemesin (sonsuz döngü).
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const load = useCallback(async () => {
    const { data } = await listMyPendingReviews();
    setItems(data);
    onCountRef.current?.(data.length);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (items.length === 0) return null;

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] });
  const count = items.length;

  const modal = (
    <ReviewModal
      visible={!!active}
      onClose={() => setActive(null)}
      workOrderId={active?.id ?? ''}
      orderLabel={active ? `${active.order_number}${active.patient_name ? ' · ' + active.patient_name : ''}` : undefined}
      raterRole={raterRole}
      onSaved={() => { setActive(null); load(); }}
    />
  );

  if (compact) {
    return (
      <>
        <AlertPillX icon={Star} count={count} label="Değerlendirilecek" color={T.primary} onPress={() => setActive(items[0])} />
        {modal}
      </>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setActive(items[0])}
        onHoverIn={() => Animated.spring(scaleAnim, { toValue: 1.015, friction: 8, tension: 200, useNativeDriver: true }).start()}
        onHoverOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start()}
        style={{ cursor: 'pointer' as any }}
      >
        <Animated.View style={{
          borderRadius: 28, overflow: 'hidden',
          // @ts-ignore web gradient — panel accent (deep → primary)
          backgroundImage: `linear-gradient(135deg, ${T.primaryDeep} 0%, ${T.primary} 100%)`,
          backgroundColor: T.primaryDeep,
          transform: [{ scale: scaleAnim }],
          position: 'relative',
        }}>
          {/* Ambient glow */}
          <Animated.View style={{
            position: 'absolute', top: -30, end: -30,
            width: 160, height: 160, borderRadius: 80,
            backgroundColor: '#FFFFFF',
            opacity: glowOpacity, transform: [{ scale: glowScale }],
          }} pointerEvents="none" />

          <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={18} color="#FFFFFF" strokeWidth={1.8} />
            </View>

            <View style={{ flex: 1 }}>
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' }} />
                <Text style={{ fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Değerlendir</Text>
                <Text style={{ fontSize: 22, fontWeight: '300', letterSpacing: -0.5, lineHeight: 24, color: '#FFF', marginStart: 4 }}>
                  {count}
                </Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginStart: 2 }}>iş değerlendirilmeyi bekliyor</Text>
              </View>
            </View>

            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              {isRTL() ? <ArrowUpLeft size={14} color="#FFFFFF" strokeWidth={1.8} /> : <ArrowUpRight size={14} color="#FFFFFF" strokeWidth={1.8} />}
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {modal}
    </>
  );
}
