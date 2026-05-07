// core/ui/MobileTabBar.tsx
// BNav — Variant B floating dark glass pill.
// Self-contained: uses usePathname / useRouter from Expo Router.
// Render this as a SIBLING of <Tabs> (outside it) so React Navigation's
// container never intercepts touches in the transparent safe area.

import React, { useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

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
}

export function MobileTabBar({ items, baseRoute, accentColor }: Props) {
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

  return (
    // pointerEvents="box-none" → wrap passes touches through; only pill children capture them
    <View pointerEvents="box-none" style={[s.wrap, { bottom: bottomOffset }]}>
      {isNativeBlur ? (
        <BlurView intensity={32} tint="dark" style={s.bar}>
          <View pointerEvents="none" style={s.barTint} />
          <View pointerEvents="none" style={s.barBorder} />
          {items.map((item, i) =>
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
                onPress={() => handlePress(item, i)}
              />
            )
          )}
        </BlurView>
      ) : (
        <View style={[s.bar, s.barWeb]}>
          <View pointerEvents="none" style={s.barBorder} />
          {items.map((item, i) =>
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
                onPress={() => handlePress(item, i)}
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

// ─── Tab cell (icon + label) ──────────────────────────────────────────────────
function TabCell({
  item, active, accentColor, onPress,
}: {
  item: MobileTabItem;
  active: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.90, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const tint = active ? accentColor : 'rgba(255,255,255,0.70)';

  return (
    <Pressable
      onPress={handle}
      style={s.cell}
      android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: true }}
    >
      <Animated.View
        style={[
          s.cellInner,
          { transform: [{ scale }] },
          active && { backgroundColor: 'rgba(255,255,255,0.10)' },
        ]}
      >
        {/* Badge dot (boolean) */}
        <View style={s.iconWrap}>
          <AppIcon name={item.icon} size={20} color={tint} strokeWidth={active ? 2.2 : 1.8} />
          {item.badge && <View style={s.dotBadge} />}
          {!item.badge && !!item.badgeCount && item.badgeCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </View>
        <Text style={[s.label, { color: tint }]} numberOfLines={1}>
          {item.label}
        </Text>
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
      Animated.timing(scale, { toValue: 0.90, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      style={s.fabCell}
      android_ripple={{ color: 'rgba(0,0,0,0.18)', borderless: true }}
    >
      <Animated.View
        style={[
          s.fab,
          { backgroundColor: accentColor, transform: [{ scale }] },
          Platform.OS === 'web'
            ? ({ boxShadow: `0 6px 18px ${accentColor}66` } as any)
            : {
                shadowColor: accentColor,
                shadowOpacity: 0.50,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              },
        ]}
      >
        <AppIcon name={item.icon} size={22} color="#0A0A0A" strokeWidth={2.2} />
      </Animated.View>
      <Text style={s.fabLabel} numberOfLines={1}>{item.label}</Text>
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
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 390,
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

  // Regular tab cell
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },

  cellInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 44,
  },

  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 3,
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

  // FAB cell
  fabCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },

  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 3,
    color: 'rgba(255,255,255,0.70)',
  },
});
