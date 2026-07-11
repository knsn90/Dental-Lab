// core/ui/MobileTabBar.tsx
// BNav — Variant B floating dark glass pill.
// Self-contained: uses usePathname / useRouter from Expo Router.
// Render this as a SIBLING of <Tabs> (outside it) so React Navigation's
// container never intercepts touches in the transparent safe area.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

// iOS 26+ liquid glass available?
const LIQUID_GLASS = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return !!isLiquidGlassAvailable?.(); }
  catch { return false; }
})();

export interface MobileTabItem {
  routeName: string;
  label: string;
  /** Lucide icon name (kebab-case) e.g. "home", "clipboard-list" */
  icon: string;
  badge?: boolean;
  badgeCount?: number;
  /** Custom action instead of navigation (opens modal, etc.) */
  onPress?: () => void;
  /** Renders this cell as the centre FAB */
  fab?: boolean;
}

interface Props {
  items: MobileTabItem[];
  /** Base route segment, e.g. "/(lab)" */
  baseRoute: string;
  /** Active + FAB tint (panel primary) */
  accentColor: string;
  /** dark (varsayılan, koyu cam) | light (beyaz cam) */
  variant?: 'dark' | 'light';
}

export function MobileTabBar({ items, baseRoute, accentColor, variant = 'dark' }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  // Determine which item is active from the current pathname
  const activeIdx = (() => {
    // Exact root match
    if (pathname === baseRoute || pathname === baseRoute + '/') return 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].onPress) continue; // modal actions are never "active"
      const seg = items[i].routeName;
      if (seg === 'index') continue;
      if (pathname.includes('/' + seg)) return i;
    }
    return 0;
  })();

  const middleIdx = Math.floor(items.length / 2);
  const isFab = (item: MobileTabItem, idx: number) =>
    item.fab === true || (items.length === 5 && idx === middleIdx);

  const handlePress = (item: MobileTabItem, idx: number) => {
    if (item.onPress) { item.onPress(); return; }
    if (item.routeName === 'index') {
      router.push(baseRoute as any);
    } else {
      router.push(`${baseRoute}/${item.routeName}` as any);
    }
  };

  const bottomOffset = Math.max(insets.bottom, 8) + 8;
  const isNativeBlur = Platform.OS === 'ios' || Platform.OS === 'android';

  const isLight = variant === 'light';

  const cells = items.map((item, i) =>
    isFab(item, i) ? (
      <FabCell
        key={item.routeName}
        accentColor={accentColor}
        item={item}
        onPress={() => handlePress(item, i)}
      />
    ) : (
      <TabCell
        key={item.routeName}
        item={item}
        active={i === activeIdx}
        accentColor={accentColor}
        light={isLight}
        onPress={() => handlePress(item, i)}
      />
    )
  );

  return (
    // pointerEvents="box-none" → wrap passes touches through; only pill children capture them
    <View pointerEvents="box-none" style={[s.wrap, { bottom: bottomOffset }]}>
      {/* iOS 26+ native liquid glass — refracts wallpaper behind it */}
      {LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isLight ? 'light' : 'dark'}
          isInteractive
          style={[s.bar, s.barLiquidGlass]}
        >
          <View pointerEvents="none" style={s.barInnerHighlight} />
          {cells}
        </GlassView>
      ) : isNativeBlur ? (
        // iOS <26 / Android — BlurView with extra-thick blur for glass feel
        <BlurView
          intensity={isLight ? 80 : 70}
          tint={isLight ? 'systemUltraThinMaterialLight' : 'systemUltraThinMaterialDark'}
          style={s.bar}
        >
          <View pointerEvents="none" style={isLight ? s.barTintLight : s.barTintGlass} />
          <View pointerEvents="none" style={s.barInnerHighlight} />
          <View pointerEvents="none" style={isLight ? s.barBorderLight : s.barBorder} />
          {cells}
        </BlurView>
      ) : (
        // Web — CSS backdrop-filter
        <View style={[s.bar, isLight ? s.barWebLight : s.barWebGlass]}>
          <View pointerEvents="none" style={s.barInnerHighlight} />
          <View pointerEvents="none" style={isLight ? s.barBorderLight : s.barBorder} />
          {cells}
        </View>
      )}
    </View>
  );
}

// ─── Tab cell — Adaptive Pill (Twitter/X, iOS 18 style) ─────────────────────
// Inactive: just an icon. Active: expands horizontally to show icon + label
// with a soft accent-tinted background pill.
function TabCell({
  item, active, accentColor, onPress, light = false,
}: {
  item: MobileTabItem;
  active: boolean;
  accentColor: string;
  onPress: () => void;
  light?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const expand = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(expand, {
      toValue: active ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: false, // animating width — can't be native
    }).start();
  }, [active, expand]);

  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 280, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const inactiveTint = light ? 'rgba(60,60,60,0.65)' : 'rgba(255,255,255,0.72)';
  const ripple       = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

  // Active pill: expanded label slot fades in
  const labelOpacity = expand.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const labelMaxWidth = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 80],
  });
  const labelMarginLeft = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });
  const pillBgOpacity = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Pressable
      onPress={handle}
      android_ripple={{ color: ripple, borderless: true }}
      style={s.cellPressable}
    >
      <Animated.View
        style={[
          s.adaptivePill,
          {
            transform: [{ scale }],
            backgroundColor: 'transparent',
          },
        ]}
      >
        {/* Animated accent background — fades in for active */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: 999,
              backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.16)',
              opacity: pillBgOpacity,
            },
          ]}
        />

        {/* Icon */}
        <View style={s.iconWrap}>
          <AppIcon
            name={item.icon}
            size={active ? 19 : 20}
            color={active ? accentColor : inactiveTint}
            strokeWidth={active ? 2.2 : 1.8}
          />
          {item.badge && <View style={s.dotBadge} />}
          {!item.badge && !!item.badgeCount && item.badgeCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </View>

        {/* Expanding label slot */}
        <Animated.View
          style={{
            maxWidth: labelMaxWidth,
            marginLeft: labelMarginLeft,
            opacity: labelOpacity,
            overflow: 'hidden',
          }}
        >
          <Text
            style={[s.adaptiveLabel, { color: accentColor }]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ─── FAB cell (centre action) ─────────────────────────────────────────────────
function FabCell({
  item, accentColor, onPress,
}: {
  item: MobileTabItem;
  accentColor: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 11, stiffness: 280, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      android_ripple={{ color: 'rgba(0,0,0,0.18)', borderless: true }}
      style={s.cellPressable}
    >
      <Animated.View
        style={[
          s.fabCompact,
          { backgroundColor: accentColor, transform: [{ scale }] },
          Platform.OS === 'web'
            ? ({ boxShadow: `0 4px 14px ${accentColor}80` } as any)
            : {
                shadowColor: accentColor,
                shadowOpacity: 0.55,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              },
        ]}
      >
        <AppIcon name={item.icon} size={20} color="#0A0A0A" strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
    // bottom is set inline via safe area insets
  },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 999,
    width: '100%',
    maxWidth: 420,
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000',
          shadowOpacity: 0.32,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 18,
        }),
  },

  barTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.55)',
  },

  barBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },

  barWeb: {
    backgroundColor: 'rgba(10,10,10,0.88)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
        } as any)
      : {}),
  },

  // ── Liquid glass (iOS 26+ native UIGlassEffect via expo-glass-effect) ──
  // GlassView handles refraction/edge highlights itself, we just need the shape.
  barLiquidGlass: {
    overflow: 'hidden',
  },

  // Glass tint — much thinner than the old opaque dark, lets background bleed through
  barTintGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,20,0.28)',
  },

  // Inner top highlight — gives the "polished" wet-glass edge
  barInnerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Web glass — heavier blur + saturation + brightness for the liquid feel
  barWebGlass: {
    backgroundColor: 'rgba(20,20,20,0.28)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(32px) saturate(200%) brightness(1.05)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%) brightness(1.05)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
        } as any)
      : {}),
  },

  // Light variant — beyaz cam
  barTintLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  barBorderLight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },

  barWebLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
        } as any)
      : {}),
  },

  // ── Adaptive Pill — tek satır, aktif olan genişler ────────────────────────
  cellPressable: {
    // Pressable itself is just the touch surface; flex/layout on inner View
  },

  adaptivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    minWidth: 44,
    overflow: 'hidden',
  },

  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  adaptiveLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  // Badge — dot
  dotBadge: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },

  // Badge — count
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },

  // Compact FAB — yuvarlak, label yok (adaptive pill bar'a uyumlu)
  fabCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
});
