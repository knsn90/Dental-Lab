/**
 * Skeleton — shimmer yükleme bileşeni
 *
 * Kullanım:
 *   <Skeleton width={200} height={16} />
 *   <Skeleton width="100%" height={80} radius={12} />
 *   <SkeletonCard />        — standart kart iskeleti
 *   <SkeletonListItem />    — liste satırı iskeleti
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

const SCREEN_W = Dimensions.get('window').width;

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = 6, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: C.border, opacity },
        style,
      ]}
    />
  );
}

// ─── Preset: Liste satırı ─────────────────────────────────────────────────────
export function SkeletonListItem() {
  return (
    <View style={sk.row}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={sk.lines}>
        <Skeleton width="60%" height={14} radius={6} />
        <Skeleton width="40%" height={11} radius={6} style={{ marginTop: 7 }} />
      </View>
      <Skeleton width={56} height={22} radius={10} />
    </View>
  );
}

// ─── Preset: Kart ─────────────────────────────────────────────────────────────
export function SkeletonCard() {
  return (
    <View style={sk.card}>
      <View style={sk.cardHeader}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width="55%" height={14} radius={6} />
          <Skeleton width="35%" height={11} radius={6} style={{ marginTop: 7 }} />
        </View>
        <Skeleton width={64} height={24} radius={12} />
      </View>
      <View style={sk.divider} />
      <Skeleton width="80%" height={12} radius={6} />
      <Skeleton width="50%" height={12} radius={6} style={{ marginTop: 8 }} />
    </View>
  );
}

// ─── Preset: KPI kartı ────────────────────────────────────────────────────────
export function SkeletonKpi() {
  return (
    <View style={sk.kpi}>
      <Skeleton width={32} height={32} radius={16} />
      <Skeleton width="70%" height={22} radius={8} style={{ marginTop: 10 }} />
      <Skeleton width="50%" height={11} radius={6} style={{ marginTop: 6 }} />
    </View>
  );
}

// ─── Preset: Tam liste yüklemesi (N adet) ────────────────────────────────────
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={sk.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

// ─── Preset: Kart listesi ─────────────────────────────────────────────────────
export function SkeletonCardList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 10, padding: S.pagePad }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: S.pagePad,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  lines: { flex: 1 },
  card: {
    backgroundColor: C.surface,
    borderRadius: S.cardRadius,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.cardPad,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  kpi: {
    backgroundColor: C.surface,
    borderRadius: S.cardRadius,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.cardPad,
    minHeight: 100,
  },
  list: {},
});
