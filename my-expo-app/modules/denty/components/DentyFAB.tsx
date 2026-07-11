/**
 * DentyFAB — root layout'ta tek instance. Her ekranda sağ-altta "morph-pill".
 *
 *   Kapalı: orb + "Denty'ye sor" hapı
 *   Açık  : hap, panele genişleyerek (scale + fade + translate) açılır
 *
 * Yalnızca giriş yapmış kullanıcıya ve (Faz 0+1/2) hekim & klinik panellerinde.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Modal, Platform, Animated, useWindowDimensions,
} from 'react-native';
import { useSegments } from 'expo-router';
import { useDentyPalette } from '../theme';
import { useAuthStore } from '../../../core/store/authStore';
import { useDentyStore } from '../store/dentyStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DentyPanel } from './DentyPanel';
import { ColorOrb } from './ColorOrb';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function DentyFAB() {
  const theme = useDentyPalette();
  const profile = useAuthStore((s) => s.profile);
  const isOpen = useDentyStore((s) => s.isOpen);
  const open = useDentyStore((s) => s.open);
  const close = useDentyStore((s) => s.close);
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const panel = String(segments?.[0] ?? '');

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: isOpen ? 1 : 0,
      useNativeDriver: true,
      stiffness: 520,
      damping: 38,
      mass: 0.7,
    }).start();
  }, [isOpen, anim]);

  if (!profile) return null;
  if (panel !== '(doctor)' && panel !== '(clinic)') return null;

  const panelStyle = {
    opacity: anim,
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
    ],
  };

  return (
    <>
      {/* ── Kapalı: morph-pill ── */}
      {!isOpen && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', right: isWide ? 24 : 16, bottom: isWide ? 24 : (insets.bottom + 104), zIndex: 9999 }}
        >
          <Pressable
            onPress={open}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 9,
              paddingLeft: 8, paddingRight: 16, height: 46, borderRadius: 23,
              backgroundColor: theme.surface,
              borderWidth: 1, borderColor: hexA(theme.accent, 0.1),
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
              elevation: 8,
              transform: [{ scale: hovered ? 1.03 : 1 }],
              ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'transform 0.15s ease' } as any) : {}),
            })}
          >
            <ColorOrb size={30} />
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.accent }}>Simanty'ye sor</Text>
          </Pressable>
        </View>
      )}

      {/* ── Açık: panel (morph) ── */}
      <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(10,14,26,0.42)',
            justifyContent: isWide ? 'center' : 'flex-end',
            alignItems: isWide ? 'flex-end' : 'stretch',
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
          }}
        >
          <Pressable onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Animated.View
            style={[
              {
                backgroundColor: theme.bg,
                overflow: 'hidden',
                ...(isWide
                  ? { width: 440, height: '100%', borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }
                  : { height: '84%', borderTopLeftRadius: 32, borderTopRightRadius: 32 }),
              },
              panelStyle,
            ]}
          >
            <DentyPanel />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
