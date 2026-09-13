// core/ui/mobile/FabTabBar.tsx
// Aydın Lab Mobile handoff — 5-slot bottom tab bar with center FAB.
// Pattern: Panel · Sipariş · [FAB] · Mesaj · Profil

import React, { useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Animated,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home, ListChecks, Plus, MessageSquare, User, type LucideIcon,
} from '../icons';
import { isRTL } from '../../i18n';
import { MOBILE_TOKENS, useMobileTokens } from '../../theme/mobileDesignTokens';

export interface FabTabItem {
  routeName: string;
  label: string;
  icon: LucideIcon;
  /** Navigate yerine custom action (modal/popup açar) */
  onPress?: () => void;
  /** Sayı rozeti */
  badgeCount?: number;
}

interface Props {
  items: [FabTabItem, FabTabItem, FabTabItem, FabTabItem]; // tam 4 (FAB ortadadır)
  baseRoute: string;
  accentColor: string;        // FAB + active color (panel primary)
  onFabPress?: () => void;
  fabIcon?: LucideIcon;        // varsayılan Plus
}

export function FabTabBar({ items, baseRoute, accentColor, onFabPress, fabIcon = Plus }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const activeIdx = (() => {
    if (pathname === baseRoute || pathname === baseRoute + '/') return 0;
    for (let i = 0; i < items.length; i++) {
      const seg = items[i].routeName;
      if (seg === 'index') continue;
      if (pathname.includes('/' + seg)) return i;
    }
    return 0;
  })();

  const goTo = (item: FabTabItem) => {
    if (item.onPress) { item.onPress(); return; }
    if (item.routeName === 'index') router.push(baseRoute as any);
    else router.push(`${baseRoute}/${item.routeName}` as any);
  };

  // Tek kaynak: useSafeAreaInsets — env() fallback kaldırıldı (double padding'e yol açıyordu)
  const bottomOffset = Math.max(insets.bottom, 12);

  const T = useMobileTokens();
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: bottomOffset }]}>
      <View style={[s.bar, { backgroundColor: T.card, borderColor: T.hairline }]}>
        <TabCell item={items[0]} active={activeIdx === 0} accent={accentColor} onPress={() => goTo(items[0])} />
        <TabCell item={items[1]} active={activeIdx === 1} accent={accentColor} onPress={() => goTo(items[1])} />
        {/* center slot — sadece spacer; FAB ayrı View'da absolute */}
        <View style={{ width: 64 }} />
        <TabCell item={items[2]} active={activeIdx === 2} accent={accentColor} onPress={() => goTo(items[2])} />
        <TabCell item={items[3]} active={activeIdx === 3} accent={accentColor} onPress={() => goTo(items[3])} />
      </View>

      {/* Center FAB — bar'ın üzerinde yüzer (negative top translate) */}
      <FabCenter accent={accentColor} onPress={onFabPress} icon={fabIcon} />
    </View>
  );
}

function TabCell({
  item, active, accent, onPress,
}: {
  item: FabTabItem;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const T = useMobileTokens();
  const scale = useRef(new Animated.Value(1)).current;
  const Icon = item.icon;

  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const tint = active ? accent : T.ink3;

  return (
    <Pressable onPress={handle} style={s.cell}>
      <Animated.View style={[s.cellInner, { transform: [{ scale }] }]}>
        <View style={{ position: 'relative' }}>
          <Icon size={22} color={tint} strokeWidth={active ? 2.2 : 1.7} />
          {!!item.badgeCount && item.badgeCount > 0 && (
            // `end:` inline stili bu projede güvenilir değil → yönü açıkça seç
            <View style={[s.countBadge, { borderColor: T.card }, isRTL() ? { left: -10 } : { right: -10 }]}>
              <Text style={s.countBadgeText}>{item.badgeCount > 99 ? '99+' : String(item.badgeCount)}</Text>
            </View>
          )}
        </View>
        <Text style={[s.label, { color: tint, fontWeight: active ? '600' : '500' }]} numberOfLines={1}>
          {item.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function FabCenter({
  accent, onPress, icon: Icon,
}: {
  accent: string;
  onPress?: () => void;
  icon: LucideIcon;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 260, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <View pointerEvents="box-none" style={s.fabWrap}>
      <Pressable onPress={handle}>
        <Animated.View
          style={[
            s.fab,
            { backgroundColor: accent, transform: [{ scale }] },
            // Flat — shadow kaldırıldı (mobile design contract: shadowless)
          ]}
        >
          <Icon size={22} color="#FFFFFF" strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    start: 0,
    end: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 420,
    backgroundColor: MOBILE_TOKENS.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: MOBILE_TOKENS.hairline,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(20px) saturate(180%)',
        } as any)
      : {
          // Flat — elevation/shadow kaldırıldı
          elevation: 0,
        }),
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.2,
    lineHeight: 12,
    marginTop: 1,
  },

  countBadge: {
    position: 'absolute',
    top: -6, // yatay konum çağrı yerinde (isRTL) verilir
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  countBadgeText: {
    fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2,
  },

  // Center FAB
  fabWrap: {
    position: 'absolute',
    top: -24,
    start: 0,
    end: 0,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Default icon helpers (handoff order: Panel · Sipariş · Mesaj · Profil) ──
export const FAB_TAB_ICONS = { Home, ListChecks, MessageSquare, User } as const;
