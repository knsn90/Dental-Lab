import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { BlurView } from 'expo-blur';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MobileTabItem {
  /** Must match a Tabs.Screen `name` prop in the parent layout */
  routeName: string;
  label: string;
  /** Feather icon name */
  icon: string;
  /** Optional red dot badge (e.g. pending approvals) */
  badge?: boolean;
  /** Optional numeric badge (e.g. low stock count) */
  badgeCount?: number;
  /**
   * Navigasyon yerine modal açmak için override onPress.
   * Verildiğinde route navigation tamamen atlanır.
   */
  onPress?: () => void;
}

interface Props {
  /** Forwarded from <Tabs tabBar={(props) => ...} /> */
  state: any;
  navigation: any;
  /** The 4–5 tabs we want visible on mobile. Order defines layout. */
  items: MobileTabItem[];
  /** Active tab tint color. admin → #0F172A, lab → #2563EB */
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
        // onPress override varsa (modal açma vb.) route navigation'ı atla
        if (item.onPress) {
          item.onPress();
          return;
        }
        const route = state.routes.find((r: any) => r.name === item.routeName);
        if (!route) return;
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (i !== activeIdx && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      }}
    />
  ));

  // Native (iOS/Android) → BlurView provides real system blur.
  // Web → `backdropFilter` CSS on the bar View delivers the same look.
  const isNativeBlur = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    // Floating wrap — doesn't occupy full width, leaves breathing room below
    <View pointerEvents="box-none" style={styles.wrap}>
      {isNativeBlur ? (
        <BlurView
          intensity={55}
          tint="light"
          style={styles.bar}
        >
          <View pointerEvents="none" style={styles.glassTint} />
          <View pointerEvents="none" style={styles.glassHighlight} />
          {tabs}
        </BlurView>
      ) : (
        <View style={[styles.bar, styles.barWeb]}>
          <View pointerEvents="none" style={styles.glassHighlight} />
          {tabs}
        </View>
      )}
    </View>
  );
}

// ─── Cell ────────────────────────────────────────────────────────────────────

function TabCell({
  item,
  active,
  accentColor,
  onPress,
}: {
  item: MobileTabItem;
  active: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const tint = active ? accentColor : '#475569';

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(15, 23, 42, 0.06)', borderless: true }}
      style={({ pressed }) => [
        styles.cell,
        pressed && Platform.OS !== 'android' && { opacity: 0.7 },
      ]}
    >
      {/* Active pill highlight — soft frosted accent behind the icon */}
      {active && (
        <View
          pointerEvents="none"
          style={[
            styles.activePill,
            { backgroundColor: accentColor + '1A' },
          ]}
        />
      )}

      <View style={styles.iconWrap}>
        <Feather name={item.icon as any} size={22} color={tint} />

        {/* Badges */}
        {item.badge && <View style={styles.dotBadge} />}
        {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {item.badgeCount > 9 ? '9+' : item.badgeCount}
            </Text>
          </View>
        )}
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: tint, fontWeight: active ? '700' : '500' },
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// ─── Liquid Glass ────────────────────────────────────────────────────────────
// Floating pill anchored above the home indicator.
// • Native (iOS/Android): expo-blur BlurView for real system blur.
// • Web: CSS backdrop-filter on the bar View for the same effect.

const styles = StyleSheet.create({
  // Outer wrap: keeps the bar floating, not edge-to-edge
  wrap: {
    paddingHorizontal: 12,
    // Sit above iOS home indicator / Android nav bar
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 6,
    // Pill
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
    width: '100%',
    maxWidth: 520,
    // Native shadow (web uses boxShadow below)
    ...(Platform.OS !== 'web' && {
      shadowColor: '#0F172A',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 16,
    }),
  },
  // Web-only: CSS backdrop-filter + shadow. On web the bar itself must carry
  // the translucent tint (no BlurView).
  barWeb: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow:
            '0 8px 32px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        } as any)
      : {}),
  },
  // Native-only: thin white wash over the BlurView so glass stays bright.
  // BlurView alone on iOS can feel too dim for a white app theme.
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  // Subtle top-edge highlight sheen (adds the "glass" feel)
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
    position: 'relative',
    minHeight: 56,
  },
  // Active-tab frosted pill behind icon + label
  activePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 6,
    right: 6,
    borderRadius: 20,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  dotBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
