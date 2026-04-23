/**
 * Responsive layout utilities
 *
 * Bu uygulama hem masaüstü hem mobil için tasarlanmıştır.
 * useBreakpoint() hook'u ve yardımcı bileşenler tüm ekranlar
 * tarafından kullanılarak tutarlı responsive davranış sağlar.
 *
 * Kurallar:
 *  - Desktop (≥769px): sidebar var, içerik maxWidth 1180px, px:32, gap:24, 4-col grid
 *  - Mobile (<769px):  tab bar var, içerik full-width, px:16, gap:12, 1-col list
 */

import React from 'react';
import {
  View, ScrollView, StyleSheet, ViewStyle, StyleProp,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Breakpoint hook ───────────────────────────────────────────────────────────
export interface Breakpoint {
  isDesktop: boolean;
  /** Yatay padding (ekranın her iki kenarı) */
  px: number;
  /** Kart/grid arası boşluk */
  gap: number;
  /** KPI / genel grid kolon sayısı */
  cols: number;
  /** İçerik max genişliği (desktop'ta 1180, mobilde Infinity) */
  maxWidth: number;
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  return {
    isDesktop,
    px:       isDesktop ? 32 : 16,
    gap:      isDesktop ? 24 : 12,
    cols:     isDesktop ? 4  : 2,
    maxWidth: isDesktop ? 1180 : Infinity,
  };
}

// ─── Screen ── Root SafeAreaView wrapper ──────────────────────────────────────
/**
 * Tüm ekranların en dış sarmalayıcısı.
 * Desktop: #F8FAFC arka plan
 * Mobile: beyaz arka plan
 */
export function Screen({
  children,
  style,
  edges,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const { isDesktop } = useBreakpoint();
  return (
    <SafeAreaView
      style={[
        sc.root,
        isDesktop ? sc.desktopBg : sc.mobileBg,
        style,
      ]}
      edges={edges ?? ['top']}
    >
      {children}
    </SafeAreaView>
  );
}

// ─── Container ── maxWidth centred inner box ───────────────────────────────────
/**
 * İçerik alanını desktop'ta max 1180px ile sınırlar.
 * ScrollView içinde veya dışında kullanılabilir.
 */
export function Container({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { px, maxWidth } = useBreakpoint();
  return (
    <View
      style={[
        { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: px },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── PageScroll ── Full-page scrollable canvas ─────────────────────────────────
/**
 * SafeAreaView içinde kullanılan tam ekran ScrollView.
 * Desktop'ta maxWidth container otomatik uygulanır.
 */
export function PageScroll({
  children,
  style,
  contentStyle,
  refreshControl,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement;
}) {
  const { px, maxWidth } = useBreakpoint();
  return (
    <ScrollView
      style={[sc.scroll, style]}
      contentContainerStyle={[
        sc.scrollContent,
        {
          paddingHorizontal: px,
          paddingBottom: 48,
        },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <View style={{ maxWidth, alignSelf: 'center', width: '100%' }}>
        {children}
      </View>
    </ScrollView>
  );
}

// ─── Grid ── Responsive multi-column grid ─────────────────────────────────────
/**
 * Desktop'ta 2-4 kolon, mobilde 1-2 kolon grid.
 * Flex-wrap tabanlı, tüm çocuklar eşit genişlikte.
 */
export function Grid({
  children,
  cols = 4,
  mCols = 2,
  gap,
  style,
}: {
  children: React.ReactNode;
  /** Desktop kolon sayısı */
  cols?: number;
  /** Mobil kolon sayısı */
  mCols?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDesktop, gap: defaultGap } = useBreakpoint();
  const numCols = isDesktop ? cols : mCols;
  const g = gap ?? defaultGap;

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: g }, style]}>
      {React.Children.map(children, child => (
        <View style={{ flexBasis: `${(100 / numCols).toFixed(2)}%`, flexGrow: 1, maxWidth: `${(100 / numCols).toFixed(2)}%` }}>
          {child}
        </View>
      ))}
    </View>
  );
}

// ─── Row ── Yatay sıra (desktop) / dikey liste (mobile) ───────────────────────
/**
 * Desktop'ta yan yana, mobilde alt alta dizer.
 */
export function Row({
  children,
  gap,
  style,
  align = 'center',
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  align?: 'center' | 'flex-start' | 'flex-end' | 'stretch';
}) {
  const { isDesktop, gap: defaultGap } = useBreakpoint();
  return (
    <View
      style={[
        {
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? align : 'stretch',
          gap: gap ?? defaultGap,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Divider ── Dikey veya yatay ayırıcı ──────────────────────────────────────
export function VDivider({ color = '#F1F5F9', height = 36, mx = 12 }: {
  color?: string; height?: number; mx?: number;
}) {
  return (
    <View style={{ width: 1, height, backgroundColor: color, marginHorizontal: mx }} />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  root:      { flex: 1 },
  desktopBg: { backgroundColor: '#F8FAFC' },
  mobileBg:  { backgroundColor: '#FFFFFF' },
  scroll:    { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
