/**
 * Seçili ayın iş tipleri (spec §7.4): en çok gelenden aza. Çubuk uzunluğu
 * yalnız AYNI kovadakiler arasında kıyaslanır (üye üyeyle, çene çeneyle);
 * çene/adet satırları ikinci tonla çizilir ve birimini yazar. Satıra basınca
 * klinik listesi o tipe süzülür ve altında 12 aylık mini grafik açılır;
 * tekrar basınca ikisi de kalkar.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { hexA } from '../../../../core/theme/stationPalette';
import { DS } from '../../../../core/theme/dsTokens';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import type { MonthKey } from '../months';
import type { WorkTypeRow } from '../aggregate';
import { barPct, diffOf, signedText } from '../overview';
import { useSpringValue } from '../useSpringValue';
import { MiniSeries } from './MiniSeries';

const web = Platform.OS === 'web';

/** Çene/adet çubuklarının ikinci tonu: accent'ten ayrışan teal (koyuda açık teal). */
export function secondTone(isDark: boolean): string {
  return isDark ? '#6FD3CA' : DS.teal.primary;
}

export interface WorkTypeListProps {
  rows: WorkTypeRow[];
  focus: string | null;
  onFocus(label: string | null): void;
  expanded: string | null;
  onExpand(label: string | null): void;
  /** Mini grafik için pencere ayları ve seçili ay. */
  months: MonthKey[];
  selected: MonthKey;
}

export function WorkTypeList({ rows, focus, onFocus, expanded, onExpand, months, selected }: WorkTypeListProps) {
  const U = useInkUI();
  const maxByBucket = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.bucket] = Math.max(m[r.bucket] ?? 0, r.qty);
    return m;
  }, [rows]);

  return (
    <View style={{ ...U.cardSolid, padding: 16, gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400], paddingHorizontal: 6, marginBottom: 6 }}>
        İş tipleri
      </Text>
      {rows.map((r) => (
        <TypeRow
          key={r.label}
          row={r}
          max={maxByBucket[r.bucket] ?? 1}
          focused={focus === r.label}
          expanded={expanded === r.label}
          months={months}
          selected={selected}
          onPress={() => {
            const off = focus === r.label;
            onFocus(off ? null : r.label);
            onExpand(off ? null : r.label);
          }}
        />
      ))}
    </View>
  );
}

function TypeRow({ row, max, focused, expanded, months, selected, onPress }: {
  row: WorkTypeRow; max: number; focused: boolean; expanded: boolean;
  months: MonthKey[]; selected: MonthKey; onPress(): void;
}) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const primaryTone = U.isDark ? '#93C5FD' : accent;
  const tone = row.bucket === 'uye' ? primaryTone : secondTone(U.isDark);
  const w = useSpringValue(barPct(row.qty, max, 3));
  const barStyle = useAnimatedStyle(() => ({ width: `${w.value}%` as any }));
  const d = diffOf(row.qty, row.compare);
  const diffTone = d?.dir === 'up' ? U.chipTones.success.fg : d?.dir === 'down' ? U.chipTones.danger.fg : U.ink[400];
  const unit = autoT(row.unitLabel);
  const dirWord = d?.dir === 'up' ? autoT('artış') : d?.dir === 'down' ? autoT('azalış') : d ? autoT('değişmedi') : autoT('kıyas yok');

  return (
    <View>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused, expanded }}
      accessibilityLabel={`${autoT(row.label)}: ${row.qty} ${unit} · ${dirWord}${d ? ` ${signedText(d.delta)}` : ''}`}
      style={({ pressed, hovered }: any) => ({
        paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14,
        backgroundColor: focused ? hexA(primaryTone, U.isDark ? 0.12 : 0.08) : hovered ? U.rowHover : 'transparent',
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(web ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: isRTL() ? 'right' : 'left', fontSize: 13.5, fontWeight: focused ? '700' : '600', color: focused && U.isDark ? primaryTone : U.ink[900] }}>
          {autoT(row.label)}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{String(row.qty)}</Text>
        <Text style={{ fontSize: 11, color: U.ink[500] }}>{unit}</Text>
        <Text style={{ minWidth: 34, writingDirection: 'ltr', textAlign: isRTL() ? 'left' : 'right', fontSize: 11.5, fontWeight: '600', color: diffTone, fontVariant: ['tabular-nums'] }}>
          {d ? signedText(d.delta) : '—'}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 999, backgroundColor: U.chipNeutral, marginTop: 7, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', borderRadius: 999, backgroundColor: tone }, barStyle]} />
      </View>
    </Pressable>
      {/* Satırın KARDEŞİ: mini grafiğe dokunmak satırı kapatmaz / ölçeklemez */}
      {expanded ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
          <MiniSeries series={row.series} months={months} selected={selected} unitLabel={unit} color={tone} />
        </View>
      ) : null}
    </View>
  );
}
