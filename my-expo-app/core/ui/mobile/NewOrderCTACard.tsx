// core/ui/mobile/NewOrderCTACard.tsx
// Big animated "Yeni Vaka" call-to-action card.
// Sits near the top of the dashboard, acts as the primary action.
//
// Animations (subtle, continuous):
//   • Background blob: slow float (translateX/Y)
//   • Plus icon: gentle pulse (scale 1.0 ↔ 1.08, 2.4s loop)
//   • Sparkle dot: orbit around plus
//   • On press: scale-down spring

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing, Image } from 'react-native';
import { Plus, Sparkles, ArrowRight } from '../icons';
import { autoT } from '../../i18n/autoTranslate';
import { GradientFill } from '../gradients';

interface Props {
  onPress: () => void;
  /** Panel accent (solid bg color) */
  accentColor: string;
  /** Optional kicker text — e.g. recent count or hint */
  kicker?: string;
  title?: string;
  subtitle?: string;
  /** Opsiyonel yan kart — verilirse CTA ¾, slot ¼ genişlikte yan yana dizilir. */
  rightSlot?: React.ReactNode;
  /**
   * Opsiyonel 3D illüstrasyon (require'lanmış PNG). Verilirse kartın sonuna
   * yaslanır ve kartın SINIRINI AŞAR (üstten/alttan taşar) — 3D derinlik hissi.
   * Görselin kendi "+" rozeti olduğu için beyaz artı dairesi gizlenir.
   * Verilmezse kart bugünkü davranışını birebir korur (diğer paneller etkilenmez).
   */
  art?: any;
  /**
   * Opsiyonel gradyan zemin (ör. lacivert HERO_NAVY). Verilmezse kart düz
   * `accentColor` ile boyanır — diğer paneller bugünkü görünümünü korur.
   */
  gradient?: { from: string; to: string; angle?: number };
  /**
   * Opsiyonel 3D ikon (require'lanmış PNG) — beyaz artı dairesinin YERİNE kartın
   * içinde durur (art gibi taşmaz; yan kartlı dar düzen için). Aynı nefes
   * animasyonunu alır. Verilmezse artı dairesi korunur.
   */
  icon?: any;
}

export function NewOrderCTACard({
  onPress,
  accentColor,
  kicker,
  title,
  subtitle,
  rightSlot,
  art,
  gradient,
  icon,
}: Props) {
  // Varsayılan metinler prop olarak gelir → JSX metin düğümü değil, autoT() şart
  const kickerText = kicker ?? autoT('PRIMARY EYLEM');
  const titleText  = title  ?? autoT('Yeni vaka oluştur');
  const pulse = useRef(new Animated.Value(0)).current;
  const blob1 = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  // Slow, gentle pulse on the plus circle (4s loop — calmer)
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  // Single background blob — slow drift only
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(blob1, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [blob1]);

  const handlePressIn = () => {
    Animated.spring(press, { toValue: 1, damping: 14, stiffness: 280, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(press, { toValue: 0, damping: 14, stiffness: 280, useNativeDriver: true }).start();
  };

  // Interpolations — much subtler
  const pulseScale  = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });
  const haloScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });

  const blob1X = blob1.interpolate({ inputRange: [0, 1], outputRange: [-15, 20] });
  const blob1Y = blob1.interpolate({ inputRange: [0, 1], outputRange: [8, -12] });

  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });

  const card = (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        rightSlot ? { flex: 2.4 } : null,
        // Görsel karttan taştığı için sonraki kartların ALTINDA kalmamalı
        art ? ({ zIndex: 3 } as any) : null,
      ]}
    >
      <Animated.View
        style={{
          ...(rightSlot
            ? { flex: 1 }
            : { marginHorizontal: 16, marginBottom: 16 }),
          borderRadius: 20,
          backgroundColor: gradient?.to ?? accentColor,
          overflow: 'hidden',
          transform: [{ scale: pressScale }],
          ...(Platform.OS === 'web'
            ? ({ boxShadow: `0 8px 22px ${(gradient?.to ?? accentColor)}40` } as any)
            : {
                shadowColor: gradient?.to ?? accentColor,
                shadowOpacity: 0.28,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }),
        }}
      >
        {/* ── Gradyan zemin (verildiyse) ─────────────────────────────── */}
        {!!gradient && <GradientFill from={gradient.from} to={gradient.to} angle={gradient.angle ?? 135} />}

        {/* ── Single background blob (slow drift) ────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -40,
            end: -40,
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: 'rgba(255,255,255,0.12)',
            transform: [{ translateX: blob1X }, { translateY: blob1Y }],
          }}
        />

        {/* ── Card content row ───────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 14,
        }}>
          {/* Left: text */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{
              fontSize: 9.5,
              fontWeight: '700',
              color: 'rgba(255,255,255,0.72)',
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              marginBottom: 4,
            }} numberOfLines={1}>
              {kickerText}
            </Text>
            <Text style={{
              fontSize: 17,
              fontWeight: '600',
              color: '#FFFFFF',
              letterSpacing: -0.3,
              lineHeight: 21,
            }} numberOfLines={1}>
              {titleText}
            </Text>
            {!!subtitle && (
              <Text style={{
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.78)',
                marginTop: 3,
                lineHeight: 15,
              }} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          {/* Right: 3D görsel varsa yalnız yer tutucu (görsel kartın dışına çizilir),
              yoksa animasyonlu artı dairesi */}
          {art ? <View style={{ width: 70 }} /> : icon ? (
            <Animated.View style={{ width: 54, height: 54, transform: [{ scale: pulseScale }] }}>
              <Image source={icon} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </Animated.View>
          ) : (
          <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            {/* Soft halo behind */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
                opacity: haloOpacity,
                transform: [{ scale: haloScale }],
              }}
            />
            {/* Plus circle */}
            <Animated.View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pulseScale }],
                ...(Platform.OS === 'web'
                  ? ({ boxShadow: '0 4px 10px rgba(0,0,0,0.14)' } as any)
                  : {
                      shadowColor: '#000',
                      shadowOpacity: 0.15,
                      shadowRadius: 7,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 4,
                    }),
              }}
            >
              <Plus size={22} color={gradient?.to ?? accentColor} strokeWidth={2.4} />
            </Animated.View>
          </View>
          )}
        </View>
      </Animated.View>

      {/* ── 3D illüstrasyon — kartın DIŞINA taşar (üstten/alttan) ───────── */}
      {!!art && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 72, height: 84,
            // Görsel YALNIZ ÜSTTEN taşar; alt kenarı kartın alt kenarıyla hizalı.
            // rightSlot yokken kartın 16px alt boşluğu Pressable'ın içinde kalıyor.
            ...(rightSlot ? { end: 16, bottom: 0 } : { end: 32, bottom: 16 }),
          }}
        >
          <Image source={art} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        </View>
      )}
    </Pressable>
  );

  // rightSlot yoksa → eski tam-genişlik davranışı (margin'ler kartın içinde).
  if (!rightSlot) return card;

  // rightSlot varsa → ¾ CTA + ¼ slot yan yana.
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'stretch', gap: 12,
      marginHorizontal: 16, marginBottom: 16,
    }}>
      {card}
      <View style={{ flex: 1 }}>{rightSlot}</View>
    </View>
  );
}
