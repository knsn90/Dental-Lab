// core/ui/mobile/PillTabBar.tsx
// Adaptive Pill bottom tab bar — Twitter/X & iOS 18 style.
// Inactive cells: icon-only. Active cell: spring-expands to a pill showing
// icon + label with a soft accent-tinted background. Single row, no labels
// under inactive icons. Liquid-glass / blurred container.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Animated, TextInput, Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  LiquidGlassView,
  LiquidGlassContainerView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { Search, X, CornerDownLeft } from 'lucide-react-native';
import { useThemeModeStore } from '../../store/themeModeStore';
import { useCommandPalette } from '../../store/commandPaletteStore';

export interface PillSearchItem {
  label: string;
  href: string;
  sublabel?: string;
}

export interface PillTabItem {
  routeName: string;
  label: string;
  icon: LucideIcon;
  /** Custom action instead of route push (modal triggers, etc.) */
  onPress?: () => void;
  /** Numeric badge */
  badgeCount?: number;
}

interface Props {
  items: PillTabItem[];
  baseRoute: string;
  accentColor?: string;
  /**
   * Optional separate FAB rendered to the right of the pill (asymmetric layout).
   * When provided, the pill stays narrow and the fabItem becomes a prominent
   * accent-filled circle next to the pill — Apple-style action-first pattern.
   */
  fabItem?: PillTabItem;
  /**
   * Eğer verilirse: routeName === 'search' olan tab'a basınca navbar yerinde
   * bir arama çubuğuna dönüşür (sayfa/menü araması). Sonuçlar bar'ın üstünde açılır.
   */
  searchItems?: PillSearchItem[];
  onSearchNavigate?: (href: string) => void;
}

// iOS 26+ native liquid glass available? (via @callstack/liquid-glass)
const LIQUID_GLASS = Platform.OS === 'ios' && !!isLiquidGlassSupported;

export function PillTabBar({ items, baseRoute, accentColor, fabItem, searchItems, onSearchNavigate }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const dark     = useThemeModeStore(s => s.resolvedDark);

  // ─── Search-morph durumu ───────────────────────────────────────────────
  const searchEnabled = !!searchItems && !!onSearchNavigate;
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  // Klavye yüksekliği — arama açıkken navbar'ı klavyenin üstüne kaydır
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e: any) => setKbHeight(e?.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const openSearch = () => {
    setSearchActive(true);
    Animated.spring(searchAnim, { toValue: 1, damping: 20, stiffness: 220, mass: 0.9, useNativeDriver: true }).start();
    setTimeout(() => inputRef.current?.focus(), 60);
  };
  const closeSearch = () => {
    inputRef.current?.blur();
    Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setSearchActive(false);
      setQuery('');
    });
  };
  const filteredSearch = useMemo(() => {
    if (!searchItems) return [];
    const q = query.trim().toLowerCase();
    if (!q) return searchItems;
    return searchItems.filter(it =>
      it.label.toLowerCase().includes(q) || (it.sublabel ?? '').toLowerCase().includes(q),
    );
  }, [searchItems, query]);

  const activeIdx = (() => {
    if (pathname === baseRoute || pathname === baseRoute + '/') return 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].onPress) continue;
      const seg = items[i].routeName;
      if (seg === 'index') continue;
      if (pathname.includes('/' + seg)) return i;
    }
    // Bilinen sekme eşleşmedi (ör. ayarlar/profil — "Daha" arkasındaki sayfalar)
    // → "Daha (...)" sekmesini aktif göster; yoksa fallback 0
    const moreIdx = items.findIndex(it => it.routeName === 'more');
    return moreIdx >= 0 ? moreIdx : 0;
  })();

  const handle = (item: PillTabItem) => {
    // Search tab → navbar'ı arama çubuğuna dönüştür (prop verildiyse)
    if (item.routeName === 'search' && searchEnabled) { openSearch(); return; }
    if (item.onPress) { item.onPress(); return; }
    if (item.routeName === 'index') router.push(baseRoute as any);
    else router.push(`${baseRoute}/${item.routeName}` as any);
  };

  const bottomOffset = Math.max(insets.bottom, 8) + 6;
  const accent = accentColor ?? '#32BB78';

  // ─── WhatsApp-style sliding indicator pill ─────────────────────────────
  // Her hücrenin layout'u (x + width) ölçülür; aktif hücre değişince tek bir
  // shared pill spring ile yeni hücrenin x/width'ine kayar.
  const [cellRects, setCellRects] = React.useState<Array<{ x: number; w: number } | null>>(
    () => items.map(() => null),
  );
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rect = cellRects[activeIdx];
    if (!rect) return;
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: rect.x, damping: 18, stiffness: 220, mass: 0.9,
        useNativeDriver: false,
      }),
      Animated.spring(indicatorW, {
        toValue: rect.w, damping: 18, stiffness: 220, mass: 0.9,
        useNativeDriver: false,
      }),
      Animated.timing(indicatorOpacity, {
        toValue: 1, duration: 160, useNativeDriver: false,
      }),
    ]).start();
  }, [activeIdx, cellRects, indicatorX, indicatorW, indicatorOpacity]);

  const handleCellLayout = (idx: number) => (e: any) => {
    const { x, width } = e.nativeEvent.layout;
    setCellRects(prev => {
      const cur = prev[idx];
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.w - width) < 0.5) return prev;
      const next = prev.slice();
      next[idx] = { x, w: width };
      return next;
    });
  };

  const pillBg = accent + (dark ? '33' : '22');

  // iOS 26+: active tab lens — exactly the bar's height (no overflow).
  // Neutral glass, no accent tint.
  const slidingIndicator = LIQUID_GLASS ? (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, bottom: 0,
        left: indicatorX,
        width: indicatorW,
        opacity: indicatorOpacity,
        borderRadius: 999,
      }}
    >
      <LiquidGlassView
        effect="regular"
        colorScheme={dark ? 'dark' : 'light'}
        tintColor={dark ? 'rgba(60,55,50,0.75)' : 'rgba(255,255,255,0.85)'}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 999 }]}
      />
    </Animated.View>
  ) : (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 6, bottom: 6,
        left: indicatorX,
        width: indicatorW,
        opacity: indicatorOpacity,
        backgroundColor: pillBg,
        borderRadius: 999,
      }}
    />
  );

  const cells = items.map((item, i) => (
    <PillCell
      key={item.routeName + i}
      item={item}
      active={i === activeIdx}
      accentColor={accent}
      dark={dark}
      onPress={() => handle(item)}
      onLayout={handleCellLayout(i)}
    />
  ));

  // ─── Search-morph: bar içeriği aktifken arama satırına dönüşür ───────────
  const searchRow = (
    <Animated.View style={[s.searchRow, { opacity: searchAnim }]}>
      <Search size={18} color={dark ? 'rgba(247,242,233,0.6)' : 'rgba(20,16,12,0.5)'} strokeWidth={2} />
      <TextInput
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        placeholder="Sayfa ara…"
        placeholderTextColor={dark ? 'rgba(247,242,233,0.4)' : 'rgba(20,16,12,0.4)'}
        style={[s.searchInput, { color: dark ? '#F7F2E9' : '#0E0E0E' }]}
        returnKeyType="search"
        autoCorrect={false}
        onSubmitEditing={() => {
          const first = filteredSearch[0];
          if (first) { onSearchNavigate?.(first.href); closeSearch(); }
        }}
      />
      <Pressable onPress={closeSearch} hitSlop={8} style={[s.searchClose, { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,16,12,0.06)' }]}>
        <X size={16} color={dark ? 'rgba(247,242,233,0.7)' : 'rgba(20,16,12,0.6)'} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );

  const barInner = searchActive ? searchRow : (<>{slidingIndicator}{cells}</>);

  // Sonuç listesi — bar'ın üstünde açılır
  const resultsOverlay = searchActive ? (
    <Animated.View
      style={[
        s.resultsCard,
        {
          opacity: searchAnim,
          transform: [{ translateY: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          backgroundColor: dark ? '#1B1916' : '#FFFFFF',
          borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)',
        },
      ]}
    >
      {filteredSearch.length === 0 ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, color: dark ? 'rgba(247,242,233,0.5)' : 'rgba(20,16,12,0.45)' }}>
            Eşleşen sayfa yok
          </Text>
        </View>
      ) : (
        filteredSearch.slice(0, 6).map((it) => (
          <Pressable
            key={it.href}
            onPress={() => { onSearchNavigate?.(it.href); closeSearch(); }}
            style={s.resultRow}
          >
            <View style={[s.resultIcon, { backgroundColor: `${accent}1A` }]}>
              <CornerDownLeft size={14} color={accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: dark ? '#F7F2E9' : '#0E0E0E' }} numberOfLines={1}>
                {it.label}
              </Text>
              {!!it.sublabel && (
                <Text style={{ fontSize: 11.5, color: dark ? 'rgba(247,242,233,0.5)' : 'rgba(20,16,12,0.45)', marginTop: 1 }} numberOfLines={1}>
                  {it.sublabel}
                </Text>
              )}
            </View>
          </Pressable>
        ))
      )}
    </Animated.View>
  ) : null;

  // Bar content — either GlassView, BlurView, or plain web fallback
  const barFlex = fabItem ? { flex: 1 } : null;
  const barContent =
    LIQUID_GLASS ? (
      <LiquidGlassView
        effect="clear"
        colorScheme={dark ? 'dark' : 'light'}
        interactive
        // Light translucent tint so the bar still reads as a surface but
        // page bg refracts through more visibly than the default regular.
        tintColor={dark ? 'rgba(27,25,22,0.45)' : 'rgba(255,255,255,0.7)'}
        style={[s.bar, barFlex, { overflow: 'visible' }]}
      >
        <View pointerEvents="none" style={s.innerHighlight} />
        {barInner}
      </LiquidGlassView>
    ) : Platform.OS === 'ios' || Platform.OS === 'android' ? (
      <BlurView
        intensity={dark ? 70 : 80}
        tint={dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
        style={[s.bar, barFlex]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
          backgroundColor: dark ? 'rgba(20,20,20,0.45)' : 'rgba(255,255,255,0.86)',
        }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
        }]} />
        <View pointerEvents="none" style={s.innerHighlight} />
        {barInner}
      </BlurView>
    ) : (
      <View style={[s.bar, barFlex, {
        // Glass — CourierTrackingScreen kartlarıyla BİREBİR aynı formül
        backgroundColor: dark ? 'rgba(20,20,20,0.30)' : 'rgba(255,255,255,0.92)',
        borderWidth: 1,
        borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)',
        ...(Platform.OS === 'web' ? ({
          backdropFilter: 'blur(10px) saturate(130%)',
          WebkitBackdropFilter: 'blur(10px) saturate(130%)',
          boxShadow: dark
            ? '0 12px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.18)'
            : '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
        } as any) : {}),
      }]}>
        <View pointerEvents="none" style={s.innerHighlight} />
        {barInner}
      </View>
    );

  // Layout — pill bar + side FAB, single row.
  // (Search moved to TopActionBar in top-right of the screen.)
  //   ┌─────────────────────────────────────┐
  //   │  [ Pill bar          ]  [  FAB   ]  │
  //   └─────────────────────────────────────┘
  // Arama aktifken FAB gizlenir → bar tüm genişliği arama çubuğuna verir.
  const content = (fabItem && !searchActive) ? (
    <View style={s.asymRow}>
      {barContent}
      <FabButton item={fabItem} accentColor={accent} />
    </View>
  ) : (
    barContent
  );

  // Arama açık + klavye varsa → navbar'ı klavyenin hemen üstüne taşı
  const wrapBottom = searchActive && kbHeight > 0
    ? kbHeight + 8
    : bottomOffset;

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: wrapBottom }]}>
      {resultsOverlay}
      {content}
    </View>
  );
}

// ─── Search button — liquid-glass circle above the FAB ─────────────────────
// iOS 26+: native GlassView (gerçek liquid glass)
// iOS/Android: BlurView (frosted glass)
// Web: backdrop-filter blur
function SearchAboveFab({ accentColor }: { accentColor?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const onPress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 11, stiffness: 280, useNativeDriver: true }),
    ]).start();
    try { useCommandPalette.getState().openPalette(); } catch { /* noop */ }
  };

  const iconColor = isDark ? '#F7F2E9' : '#0E0E0E';
  const accentBorder = accentColor
    ? (isDark ? `${accentColor}55` : `${accentColor}66`)
    : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)');
  const shadowStyle = Platform.OS === 'web'
    ? ({
        boxShadow: isDark
          ? '0 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
      } as any)
    : {
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.4 : 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      };

  // ─ iOS 26+ native liquid glass
  if (LIQUID_GLASS) {
    // Apply an explicit neutral tintColor on the glass material itself —
    // this overrides background-pixel refraction so the disc reads as the
    // same neutral white as the pill bar (which is over the cream page bg).
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        <Animated.View style={[s.searchAbove, shadowStyle, {
          transform: [{ scale }],
          backgroundColor: 'transparent',
          borderWidth: 0,
          overflow: 'hidden',
        }]}>
          <LiquidGlassView
            effect="regular"
            colorScheme={isDark ? 'dark' : 'light'}
            interactive
            // Half-translucent neutral tint — same airy glass feel as the
            // top action buttons (QR / Bell / Profile).
            tintColor={isDark ? 'rgba(27,25,22,0.55)' : 'rgba(255,255,255,0.55)'}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 28 }]}
          />
          <Search size={22} color={iconColor} strokeWidth={2} />
        </Animated.View>
      </Pressable>
    );
  }

  // ─ iOS < 26 + Android: BlurView frosted glass
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        <Animated.View style={[s.searchAbove, shadowStyle, {
          transform: [{ scale }],
          backgroundColor: 'transparent',
          borderWidth: 0,
          overflow: 'hidden',
        }]}>
          <BlurView
            intensity={isDark ? 55 : 45}
            tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Tint overlay — yumuşatılmış, blur'a alan bırakıyor */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
            backgroundColor: isDark ? 'rgba(10,10,10,0.42)' : 'rgba(255,255,255,0.32)',
          }]} />
          {/* Accent-tinted border (panel'e bağ) */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: accentBorder,
          }]} />
          <Search size={20} color={iconColor} strokeWidth={2} />
        </Animated.View>
      </Pressable>
    );
  }

  // ─ Web fallback
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Animated.View style={[s.searchAbove, shadowStyle, {
        transform: [{ scale }],
        backgroundColor: isDark ? 'rgba(20,16,12,0.55)' : 'rgba(255,255,255,0.55)',
        borderColor: accentBorder,
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
      } as any]}>
        <Search size={20} color={iconColor} strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
}

// ─── Side FAB — separate accent-filled circle next to the pill ──────────────
function FabButton({ item, accentColor }: { item: PillTabItem; accentColor: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const Icon  = item.icon;

  const handle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 11, stiffness: 280, useNativeDriver: true }),
    ]).start();
    if (item.onPress) item.onPress();
  };

  // iOS 26+: tinted liquid-glass FAB — accent emerges through the glass material.
  // Note: keep shadow neutral (black, low opacity) — saffron shadow would bleed
  // onto nearby glass surfaces (search button) via screen-pixel refraction.
  if (LIQUID_GLASS) {
    return (
      <Pressable onPress={handle} hitSlop={6}>
        <Animated.View
          style={[
            s.fab,
            {
              transform: [{ scale }],
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              overflow: 'hidden',
            },
          ]}
        >
          <LiquidGlassView
            effect="regular"
            tintColor={accentColor}
            interactive
            style={[StyleSheet.absoluteFillObject, { borderRadius: 28 }]}
          />
          <Icon size={26} color="#FFFFFF" strokeWidth={2.6} />
          {!!item.badgeCount && item.badgeCount > 0 && (
            <View style={[s.countBadge, { borderColor: accentColor }]}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handle} hitSlop={6}>
      <Animated.View
        style={[
          s.fab,
          { backgroundColor: accentColor, transform: [{ scale }] },
          Platform.OS === 'web'
            ? ({ boxShadow: `0 8px 22px ${accentColor}60` } as any)
            : {
                shadowColor: accentColor,
                shadowOpacity: 0.55,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              },
        ]}
      >
        <Icon size={26} color="#FFFFFF" strokeWidth={2.6} />
        {!!item.badgeCount && item.badgeCount > 0 && (
          <View style={[s.countBadge, { borderColor: accentColor }]}>
            <Text style={s.countBadgeText}>
              {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Single cell — collapses to icon-only or expands to icon+label pill ──────
function PillCell({
  item, active, accentColor, dark, onPress, onLayout,
}: {
  item: PillTabItem;
  active: boolean;
  accentColor: string;
  dark: boolean;
  onPress: () => void;
  onLayout?: (e: any) => void;
}) {
  const Icon  = item.icon;
  const scale = useRef(new Animated.Value(1)).current;
  const expand = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(expand, {
      toValue: active ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: false, // maxWidth / margin animations require JS driver
    }).start();
  }, [active, expand]);

  const tapAnim = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 280, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  // Inactive tints
  const inactiveTint = dark ? 'rgba(255,255,255,0.78)' : 'rgba(45,45,45,0.88)';

  // Interpolations from `expand` (0 → 1)
  const labelOpacity = expand.interpolate({
    inputRange: [0, 0.55, 1],
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

  return (
    <Pressable onPress={tapAnim} style={s.cellPressable} onLayout={onLayout}>
      <Animated.View style={[s.cellInner, { transform: [{ scale }] }]}>
        {/* NOTE: Pill background artık parent'taki shared sliding indicator
            tarafından çiziliyor (WhatsApp-style smooth motion). */}

        <View style={s.iconWrap}>
          <Icon
            size={active ? 20 : 21}
            color={active ? accentColor : inactiveTint}
            strokeWidth={active ? 2.2 : 1.9}
          />
          {!!item.badgeCount && item.badgeCount > 0 && (
            <View style={[s.countBadge, { borderColor: dark ? '#0A0A0A' : '#FFFFFF' }]}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </View>

        {/* Expanding label slot — "more" sekmesinde yazı yok (sadece ••• ikon) */}
        {item.routeName !== 'more' && (
          <Animated.View
            style={{
              maxWidth: labelMaxWidth,
              marginLeft: labelMarginLeft,
              opacity: labelOpacity,
              overflow: 'hidden',
            }}
          >
            <Text
              style={[s.label, { color: accentColor }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 999,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000',
          shadowOpacity: 0.30,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 16,
        }),
  },

  // ─── Search-morph: bar içi arama satırı + sonuç kartı ───
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
  searchClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(15,23,42,0.18)' } as any
      : {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 18,
        }),
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  resultIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom row — pill flex + FAB on same baseline
  asymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },

  // FAB column — search button above, FAB below (legacy, unused with new layout)
  fabStack: {
    alignItems: 'center',
    gap: 8,
  },

  // Side FAB circle — solid accent
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Search button — 56px equal to FAB, neutral liquid-glass disc
  searchAbove: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Each cell is a touch surface (Pressable) wrapping the layout View
  cellPressable: {
    // no flex — cells take only space their content needs
  },

  cellInner: {
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

  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  countBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
