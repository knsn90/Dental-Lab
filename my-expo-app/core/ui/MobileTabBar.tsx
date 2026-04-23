// core/ui/MobileTabBar.tsx
// Liquid Glass Tab Bar — Apple WWDC 2025 design language
// Multi-layer frosted glass pill · Specular rim highlights · Glowing liquid active state

import React, { useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  Platform,
  Animated,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { BlurView } from 'expo-blur';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MobileTabItem {
  routeName: string;
  label: string;
  icon: string;
  badge?: boolean;
  badgeCount?: number;
  onPress?: () => void;
}

interface Props {
  state: any;
  navigation: any;
  items: MobileTabItem[];
  /** Active tint. admin → #0F172A  lab → #2563EB */
  accentColor: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MobileTabBar({ state, navigation, items, accentColor }: Props) {
  const currentRouteName = state.routes[state.index]?.name;
  const activeIdx = items.findIndex((i) => i.routeName === currentRouteName);

  const tabs = items.map((item, i) => (
    <TabCell
      key={item.routeName}
      item={item}
      active={i === activeIdx}
      accentColor={accentColor}
      onPress={() => {
        if (item.onPress) { item.onPress(); return; }
        const route = state.routes.find((r: any) => r.name === item.routeName);
        if (!route) return;
        const event = navigation.emit({
          type: 'tabPress', target: route.key, canPreventDefault: true,
        });
        if (i !== activeIdx && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      }}
    />
  ));

  const isNativeBlur = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      {isNativeBlur ? (
        <BlurView intensity={80} tint="light" style={s.bar}>
          {/* Layer 1 — White frost wash */}
          <View pointerEvents="none" style={s.frostLayer} />
          {/* Layer 2 — Top specular shimmer (gradient-like) */}
          <View pointerEvents="none" style={s.shimmerTop} />
          {/* Layer 3 — Subtle bottom edge refraction */}
          <View pointerEvents="none" style={s.shimmerBottom} />
          {/* Layer 4 — Hairline top highlight */}
          <View pointerEvents="none" style={s.hairlineTop} />
          {tabs}
        </BlurView>
      ) : (
        // Web: CSS backdrop-filter delivers the glass look
        <View style={[s.bar, s.barWeb]}>
          <View pointerEvents="none" style={s.shimmerTop} />
          <View pointerEvents="none" style={s.shimmerBottom} />
          <View pointerEvents="none" style={s.hairlineTop} />
          {tabs}
        </View>
      )}
    </View>
  );
}

// ─── Tab Cell ────────────────────────────────────────────────────────────────

function TabCell({
  item, active, accentColor, onPress,
}: {
  item: MobileTabItem;
  active: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    // Liquid press bounce
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 12,
        stiffness: 260,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const tint = active ? accentColor : '#64748B';

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: 'rgba(15,23,42,0.06)', borderless: true }}
      style={s.cell}
    >
      <Animated.View
        style={[s.cellInner, { transform: [{ scale: scaleAnim }] }]}
      >
        {/* ── Active pill ─────────────────────────────────── */}
        {active && (
          <View style={s.pillWrap}>
            {/* Outer ambient glow (colored) */}
            <View
              pointerEvents="none"
              style={[
                s.pillGlow,
                {
                  ...(Platform.OS === 'web'
                    ? ({
                        boxShadow: `0 0 18px 4px ${accentColor}30`,
                      } as any)
                    : {
                        shadowColor: accentColor,
                        shadowOpacity: 0.28,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 2 },
                      }),
                },
              ]}
            />
            {/* Pill body — tinted liquid fill */}
            <View
              style={[
                s.pill,
                { backgroundColor: accentColor + '1C' },
              ]}
            >
              {/* Inner top specular — makes pill look like a glass droplet */}
              <View style={s.pillSpecular} />
              {/* Inner bottom faint edge */}
              <View style={s.pillBottomEdge} />
              {/* Thin border ring */}
              <View
                style={[
                  s.pillBorder,
                  { borderColor: accentColor + '38' },
                ]}
              />
            </View>
          </View>
        )}

        {/* ── Icon ────────────────────────────────────────── */}
        <View style={s.iconWrap}>
          <Feather
            name={item.icon as any}
            size={active ? 22 : 21}
            color={tint}
          />
          {item.badge && <View style={s.dotBadge} />}
          {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 9 ? '9+' : item.badgeCount}
              </Text>
            </View>
          )}
        </View>

        {/* ── Label ───────────────────────────────────────── */}
        <Text
          numberOfLines={1}
          style={[
            s.label,
            {
              color:      tint,
              fontWeight: active ? '700' : '400',
              opacity:    active ? 1 : 0.75,
            },
          ]}
        >
          {item.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Outer floating wrap ────────────────────────────────────────────────────
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },

  // ── Glass pill container ───────────────────────────────────────────────────
  bar: {
    flexDirection: 'row',
    alignItems:    'stretch',
    paddingVertical:   6,
    paddingHorizontal: 4,
    borderRadius: 36,
    // Multi-layer border: bright top edge fades to translucent
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
    width:    '100%',
    maxWidth: 520,
    // Native shadow (layered depth)
    ...(Platform.OS !== 'web' && {
      shadowColor:   '#0F172A',
      shadowOpacity: 0.16,
      shadowRadius:  28,
      shadowOffset:  { width: 0, height: 10 },
      elevation: 20,
    }),
  },

  // Web-only glass styles
  barWeb: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter:       'blur(40px) saturate(200%) brightness(1.05)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.05)',
          boxShadow: [
            '0 12px 40px rgba(15,23,42,0.14)',
            '0 3px 10px rgba(15,23,42,0.08)',
            'inset 0 1.5px 0 rgba(255,255,255,0.95)',
            'inset 0 -1px 0 rgba(255,255,255,0.40)',
            'inset 1px 0 0 rgba(255,255,255,0.30)',
            'inset -1px 0 0 rgba(255,255,255,0.30)',
          ].join(', '),
        } as any)
      : {}),
  },

  // Layer 1 — white frost (native: sits over BlurView to brighten it)
  frostLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },

  // Layer 2 — top shimmer (the main "glass slab" illusion)
  // Fades from bright white at top to transparent ≈30% height
  shimmerTop: {
    position: 'absolute',
    top:   0,
    left:  0,
    right: 0,
    height: '40%',
    // On native we approximate with a semi-transparent overlay
    // On web CSS linear-gradient is applied via boxShadow on barWeb
    backgroundColor: 'rgba(255,255,255,0.22)',
    // borderBottomWidth: 0 — no hard edge
    pointerEvents: 'none',
  },

  // Layer 3 — bottom refraction edge (glass looks thicker at base)
  shimmerBottom: {
    position: 'absolute',
    bottom: 0,
    left:   0,
    right:  0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },

  // Layer 4 — hairline specular at very top (the "rim" of the glass)
  hairlineTop: {
    position: 'absolute',
    top:   0,
    left:  0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },

  // ── Tab cell ───────────────────────────────────────────────────────────────
  cell: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical:   6,
    paddingHorizontal: 2,
    position: 'relative',
    minHeight: 60,
  },

  cellInner: {
    alignItems:     'center',
    justifyContent: 'center',
    gap: 3,
  },

  // ── Active pill (liquid droplet) ───────────────────────────────────────────
  pillWrap: {
    position: 'absolute',
    top:    2,
    bottom: 2,
    left:   2,
    right:  2,
  },

  // Outer ambient glow ring (colored halo around the pill)
  pillGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },

  // Main pill body
  pill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: 'hidden',
  },

  // Top-inner specular line — gives the "liquid drop" look
  pillSpecular: {
    position: 'absolute',
    top:   0,
    left:  '8%',
    right: '8%',
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 99,
  },

  // Bottom faint inner edge — depth
  pillBottomEdge: {
    position: 'absolute',
    bottom: 0,
    left:  '8%',
    right: '8%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 99,
  },

  // Thin border ring on pill
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth:  1,
  },

  // ── Icon & label ───────────────────────────────────────────────────────────
  iconWrap: {
    width:  28,
    height: 28,
    alignItems:     'center',
    justifyContent: 'center',
  },

  label: {
    fontSize:      10.5,
    letterSpacing: 0.1,
  },

  // ── Badges ─────────────────────────────────────────────────────────────────
  dotBadge: {
    position:  'absolute',
    top:       -1,
    right:     -3,
    width:     8,
    height:    8,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  countBadge: {
    position:  'absolute',
    top:       -5,
    right:     -9,
    minWidth:  18,
    height:    18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  countBadgeText: {
    color:      '#FFFFFF',
    fontSize:   9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
