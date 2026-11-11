/**
 * Tetikleyicinin altından açılıp oraya kapanan küçük açılır kart (klinik seçici,
 * "Dışa aktar" menüsü). Yay: kritik sönümlü (dampingRatio 1, ~350 ms), kesilebilir;
 * hareket azaltılmışsa yalnız solma. Arka plan şeffaf — dışarı basınca kapanır.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Dimensions, Platform, View, StyleSheet } from 'react-native';
import { autoT } from '../../../../core/i18n/autoTranslate';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, useReducedMotion, runOnJS,
} from 'react-native-reanimated';
import { useInkUI } from '../../../../core/theme/inkScale';
import { isRTL } from '../../../../core/i18n';

export type AnchorRect = { x: number; y: number; w: number; h: number };

/** measureInWindow ile tetikleyicinin pencere içi kutusu. */
export function measureAnchor(node: any, cb: (a: AnchorRect | null) => void) {
  if (node?.measureInWindow) {
    node.measureInWindow((x: number, y: number, w: number, h: number) => cb({ x, y, w, h }));
  } else cb(null);
}

const SPRING = { dampingRatio: 1, duration: 350 } as const;

export function AnchoredPopover({ visible, anchor, onClose, width = 280, maxHeight = 420, children }: {
  visible: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  width?: number;
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const U = useInkUI();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      p.value = reduced ? withTiming(1, { duration: 140 }) : withSpring(1, SPRING);
    } else if (mounted) {
      const done = (fin?: boolean) => { if (fin) runOnJS(setMounted)(false); };
      p.value = reduced ? withTiming(0, { duration: 120 }, done) : withSpring(0, SPRING, done);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: reduced ? [] : [
      { translateY: (1 - p.value) * -6 },
      { scale: 0.96 + 0.04 * p.value },
    ],
  }));

  if (!mounted) return null;

  const win = Dimensions.get('window');
  const w = Math.min(width, win.width - 16);
  const rtl = isRTL();
  const rawLeft = anchor ? (rtl ? anchor.x + anchor.w - w : anchor.x) : (win.width - w) / 2;
  const left = Math.min(Math.max(8, rawLeft), win.width - w - 8);
  const below = anchor ? anchor.y + anchor.h + 6 : 80;
  const room = win.height - below - 12;
  const openUp = !!anchor && room < 220 && anchor.y > room;
  const mh = Math.min(maxHeight, openUp ? anchor!.y - 18 : room);
  const pos = openUp ? { bottom: win.height - anchor!.y + 6 } : { top: below };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {/* Dışarı basınca kapanır — kartın KARDEŞİ (iç içe <button> olmasın) */}
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityLabel={autoT('Kapat')} />
        <Animated.View
          style={[{
            position: 'absolute', left, width: w, maxHeight: mh,
            backgroundColor: U.surface, borderRadius: 18, borderWidth: 1, borderColor: U.hairline,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? { boxShadow: U.isDark ? '0 12px 40px rgba(0,0,0,0.6)' : '0 12px 40px rgba(15,23,42,0.18)',
                  transformOrigin: openUp ? 'bottom' : 'top' } as any
              : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10 }),
          }, pos, anim]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
