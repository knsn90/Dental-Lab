// core/ui/mobile/TechCheckInCTACard.tsx
// Big animated "QR Check-In" call-to-action card for technician dashboard.
// Tap → opens scan modal. Scanner detects /checkin?token=XXX and routes
// to time-tracking RPC.
//
// Animations (subtle, continuous):
//   • Background blob: slow float
//   • QR icon: gentle pulse (scale 1.0 ↔ 1.04, 4.4s loop)
//   • Halo: soft expanding ring behind QR icon
//   • On press: scale-down spring

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing } from 'react-native';
import { QrCode, Clock } from 'lucide-react-native';
import { autoT } from '../../i18n/autoTranslate';

interface Props {
  onPress: () => void;
  /** Panel accent (solid bg color) */
  accentColor: string;
  /** Optional kicker text — e.g. "MESAİ" / shift status */
  kicker?: string;
  title?: string;
  subtitle?: string;
}

export function TechCheckInCTACard({
  onPress,
  accentColor,
  kicker,
  title,
  subtitle,
}: Props) {
  // Varsayılan metinler prop olarak gelir → JSX metin düğümü değil, autoT() şart
  const kickerText = kicker ?? autoT('MESAİ');
  const titleText  = title  ?? autoT('QR ile giriş yap');
  const pulse = useRef(new Animated.Value(0)).current;
  const blob1 = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  // Slow gentle pulse on the QR icon (4.4s loop — calm)
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  // Single background blob — slow drift
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

  // Interpolations
  const pulseScale  = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });
  const haloScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });

  const blob1X = blob1.interpolate({ inputRange: [0, 1], outputRange: [-15, 20] });
  const blob1Y = blob1.interpolate({ inputRange: [0, 1], outputRange: [8, -12] });

  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={{
          marginHorizontal: 16,
          marginBottom: 16,
          borderRadius: 20,
          backgroundColor: accentColor,
          overflow: 'hidden',
          transform: [{ scale: pressScale }],
          ...(Platform.OS === 'web'
            ? ({ boxShadow: `0 8px 22px ${accentColor}40` } as any)
            : {
                shadowColor: accentColor,
                shadowOpacity: 0.28,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }),
        }}
      >
        {/* Drifting background blob */}
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

        {/* Content row */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 14,
        }}>
          {/* Left: text */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Clock size={11} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
              <Text style={{
                fontSize: 9.5,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }} numberOfLines={1}>
                {kickerText}
              </Text>
            </View>
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
                color: 'rgba(255,255,255,0.85)',
                marginTop: 3,
                lineHeight: 15,
              }} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          {/* Right: animated QR circle */}
          <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            {/* Soft halo */}
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
            {/* QR circle */}
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
              <QrCode size={22} color={accentColor} strokeWidth={2.2} />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
