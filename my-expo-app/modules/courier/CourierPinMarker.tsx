/**
 * CourierPinMarker — kurye pininin NATIVE karşılığı (react-native-maps Marker
 * çocuğu). Web'deki `courierPin.ts` markup'ıyla aynı geometri: 64px fotoğraf
 * çerçevesi + 14px beyaz uç, çapa alt-orta.
 *
 * NABIZ: canlı konumda yeşil halka büyüyüp söner. Native'de sürekli hareket eden
 * marker `tracksViewChanges` açık kalmasını gerektirir (harita her karede yeniden
 * rasterize eder) — bu yüzden nabız YALNIZ `live` iken çalışır ve `reduce motion`
 * açıkken hiç başlamaz; canlılık bilgisi o durumda sabit yeşil halkadan okunur.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing } from 'react-native';
import {
  PIN_W, PIN_H, PIN_FRAME, PIN_FRAME_X, PIN_FRAME_Y, PIN_TAIL_W, PIN_TAIL_H,
  PIN_RING, PIN_INITIALS_SIZE, PIN_LIVE_GREEN, courierInitials,
} from './courierPin';
import { prefersReducedMotion } from '../../core/ui/HeroGlow';

export function CourierPinMarker({ photo, name, live, accent = '#0A2540' }: {
  photo?: string | null;
  name?: string | null;
  live?: boolean;
  accent?: string;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!live || prefersReducedMotion()) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1, duration: 2200,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, live]);

  const haloScale   = pulse.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1.95, 1.95] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.85, 0, 0] });

  return (
    <View style={{ width: PIN_W, height: PIN_H, alignItems: 'center' }}>
      {live ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: PIN_FRAME_Y, left: PIN_FRAME_X,
            width: PIN_FRAME, height: PIN_FRAME, borderRadius: PIN_FRAME / 2,
            backgroundColor: `${PIN_LIVE_GREEN}33`,
            borderWidth: 1.5, borderColor: `${PIN_LIVE_GREEN}66`,
            transform: [{ scale: haloScale }], opacity: haloOpacity,
          }}
        />
      ) : null}

      {/* Uç — CSS border üçgeninin RN karşılığı; çerçevenin 4px altına girer. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: PIN_H - PIN_TAIL_H,
          width: 0, height: 0,
          borderLeftWidth: PIN_TAIL_W / 2, borderRightWidth: PIN_TAIL_W / 2, borderTopWidth: PIN_TAIL_H,
          borderLeftColor: 'transparent', borderRightColor: 'transparent',
          borderTopColor: '#FFFFFF',
        }}
      />

      <View style={{
        position: 'absolute', top: PIN_FRAME_Y, left: PIN_FRAME_X,
        width: PIN_FRAME, height: PIN_FRAME, borderRadius: PIN_FRAME / 2,
        backgroundColor: '#FFFFFF', padding: PIN_RING, overflow: 'hidden',
        // Canlı halkası çerçevenin DIŞINA (web'deki box-shadow spread'in karşılığı).
        ...(live ? { borderWidth: 2, borderColor: PIN_LIVE_GREEN } : null),
        shadowColor: '#0F172A', shadowOpacity: 0.28, shadowRadius: 7, shadowOffset: { width: 0, height: 5 },
        elevation: 6,
      }}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={{ width: '100%', height: '100%', borderRadius: (PIN_FRAME - PIN_RING * 2) / 2 }}
            accessibilityLabel={String(name ?? 'Kurye')}
          />
        ) : (
          <View style={{
            width: '100%', height: '100%', borderRadius: (PIN_FRAME - PIN_RING * 2) / 2,
            backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: PIN_INITIALS_SIZE, fontWeight: '700', color: '#FFFFFF' }}>
              {courierInitials(name)}
            </Text>
          </View>
        )}
      </View>

    </View>
  );
}
