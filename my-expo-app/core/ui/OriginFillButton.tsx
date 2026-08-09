/**
 * OriginFillButton — "origin fill" etkileşimi: dokunulan/işaretlenen noktadan
 * bir daire açılarak butonu doldurur, içerik rengi tersine döner.
 *
 * NOT: Bu efektin shadcn/framer-motion sürümü bu projede çalışmaz (DOM'a özel
 * <motion.button> + Tailwind class'ları). Burada aynı davranış React Native
 * Animated + Pressable ile yazıldı → hem web hem iOS/Android'de çalışır.
 *
 * Renkler panel accent'inden gelir (CLAUDE.md §7 — sabit renk yok).
 * İkonlar Lucide (§İkon Kuralı).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, Pressable, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

/** Referanstaki cubic-bezier(0.16, 1, 0.3, 1) ve 500ms. */
const FILL_DURATION = 500;
const FILL_EASING = Easing.bezier(0.16, 1, 0.3, 1);

/** Verilen zemin rengi üzerinde okunur metin rengi (OrderDetailScreenV2 ile aynı eşik). */
export function readableInk(hex: string): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return '#FFFFFF';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#3A2E1F' : '#FFFFFF';
}

/** Origin'den butonun en uzak köşesine kadar olan çapı verir. */
function coverDiameter(w: number, h: number, x: number, y: number): number {
  return Math.ceil(2 * Math.max(
    Math.hypot(x, y),
    Math.hypot(w - x, y),
    Math.hypot(x, h - y),
    Math.hypot(w - x, h - y),
  ));
}

/**
 * OriginFillPressable — hazır etiket/ikon düzeni olmayan butonlar için.
 * `content(color)` iki kez çağrılır: dolgu öncesi ve sonrası renkle. İki katman
 * üst üste durur, dolgu ilerledikçe çapraz-geçiş yapar.
 */
export interface OriginFillPressableProps {
  onPress: () => void;
  content: (color: string) => React.ReactNode;
  baseContentColor: string;
  fillContentColor: string;
  fillColor: string;
  fillBorderColor?: string;
  radius?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function OriginFillPressable({
  onPress, content, baseContentColor, fillContentColor,
  fillColor, fillBorderColor, radius = 999, disabled = false, style, accessibilityLabel,
}: OriginFillPressableProps) {
  const fill = useOriginFill();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onLayout={fill.onLayout}
      onPressIn={fill.onPressIn}
      onPressOut={fill.reset}
      onHoverIn={fill.fromCenter}
      onHoverOut={fill.reset}
      style={[{
        overflow: 'hidden', borderRadius: radius,
        opacity: disabled ? 0.5 : 1,
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : {}),
      }, style]}
    >
      {fill.diameter > 0 && (
        <Animated.View pointerEvents="none" style={fill.circleStyle(fillColor)} />
      )}
      {!!fillBorderColor && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: radius, borderWidth: 1, borderColor: fillBorderColor,
            opacity: fill.progress,
          }}
        />
      )}
      <Animated.View style={{ opacity: fill.inverse }}>
        {content(baseContentColor)}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center',
          opacity: fill.progress,
        }}
      >
        {content(fillContentColor)}
      </Animated.View>
    </Pressable>
  );
}

/** Origin-fill animasyonunun ortak durumu — iki bileşen de bunu kullanır. */
function useOriginFill() {
  const progress = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const diameter = useMemo(
    () => (size.w > 0 && size.h > 0 ? coverDiameter(size.w, size.h, origin.x, origin.y) : 0),
    [size.w, size.h, origin.x, origin.y],
  );

  const animateTo = useCallback((to: number) => {
    Animated.timing(progress, {
      toValue: to, duration: FILL_DURATION, easing: FILL_EASING, useNativeDriver: true,
    }).start();
  }, [progress]);

  const fillFrom = useCallback((x: number, y: number) => {
    setOrigin({ x, y });
    animateTo(1);
  }, [animateTo]);

  return {
    progress,
    inverse: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    diameter,
    onLayout: (e: any) => {
      const { width, height } = e.nativeEvent.layout;
      setSize({ w: width, h: height });
    },
    onPressIn: (e: any) => {
      const { locationX, locationY } = e.nativeEvent;
      fillFrom(
        Number.isFinite(locationX) ? locationX : size.w / 2,
        Number.isFinite(locationY) ? locationY : size.h / 2,
      );
    },
    fromCenter: () => fillFrom(size.w / 2, size.h / 2),
    reset: () => animateTo(0),
    circleStyle: (color: string) => ({
      position: 'absolute' as const,
      left: origin.x - diameter / 2,
      top: origin.y - diameter / 2,
      width: diameter, height: diameter, borderRadius: diameter / 2,
      backgroundColor: color,
      transform: [{ scale: progress }],
    }),
  };
}

export interface OriginFillButtonProps {
  label: string;
  onPress: () => void;
  /** Lucide bileşeni — renk/boyut buton tarafından verilir. */
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  /** Dolgu tamamlandığında içeriğin alacağı renk. */
  fillTextColor: string;
  /** Dolgu öncesi içerik rengi. */
  baseTextColor: string;
  /** Dolgu dairesinin rengi. */
  fillColor: string;
  /**
   * Dolgu açık/beyaz olduğunda buton zeminden ayrışmaz → dolu haldeyken
   * gösterilecek kenar rengi. Dolgu ilerledikçe fade-in yapar.
   */
  fillBorderColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  radius?: number;
  paddingVertical?: number;
  fontSize?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function OriginFillButton({
  label, onPress, icon: Icon,
  fillTextColor, baseTextColor, fillColor, fillBorderColor,
  backgroundColor, borderColor,
  radius = 16, paddingVertical = 10, fontSize = 12.5, iconSize = 14,
  disabled = false, style, testID,
}: OriginFillButtonProps) {
  const fill = useOriginFill();

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      onLayout={fill.onLayout}
      onPressIn={fill.onPressIn}
      onPressOut={fill.reset}
      onHoverIn={fill.fromCenter}
      onHoverOut={fill.reset}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical, borderRadius: radius, overflow: 'hidden',
        backgroundColor,
        ...(borderColor ? { borderWidth: 1, borderColor } : null),
        opacity: disabled ? 0.5 : 1,
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : {}),
      }, style]}
    >
      {/* Dolgu dairesi — origin'den açılır */}
      {fill.diameter > 0 && (
        <Animated.View pointerEvents="none" style={fill.circleStyle(fillColor)} />
      )}

      {/* Dolu haldeki kenar — beyaz/açık dolguda butonun sınırı kaybolmasın. */}
      {!!fillBorderColor && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: radius, borderWidth: 1, borderColor: fillBorderColor,
            opacity: fill.progress,
          }}
        />
      )}

      {/* İçerik iki kat: alt katman normal renk, üst katman ters renk.
          Daire açılırken üst katman fade-in yapar → renk geçişi yumuşak. */}
      <Animated.View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          opacity: fill.inverse,
        }}
      >
        {Icon && <Icon size={iconSize} color={baseTextColor} strokeWidth={1.9} />}
        <Text style={{ fontSize, fontWeight: '600', color: baseTextColor }}>{label}</Text>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: fill.progress,
        }}
      >
        {Icon && <Icon size={iconSize} color={fillTextColor} strokeWidth={1.9} />}
        <Text style={{ fontSize, fontWeight: '600', color: fillTextColor }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
