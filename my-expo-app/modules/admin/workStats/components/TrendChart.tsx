/**
 * 12 aylık trend (spec §7.3) — Admin Özet "Üye Trendi" kartının taranmış hap
 * sütun dili: çizgili ray + üstünde dolgu. Seçili ay dolu accent, diğerleri
 * soluk; kayıt dönemi öncesi aylar kesik çizgili boş ray + "kayıt yok".
 * "Geçen yıl" kıyasında geçen yılın aynı ayı rayın içinde ince bir çizgi
 * olarak işaretlenir (verisi yoksa çizilmez). Sütun yükseklikleri yayla akar
 * (useSpringValue). Dar alanda yatay kaydırılır; seçili ay görünür alana
 * kaydırılır. Zaman ekseni RTL'de de soldan sağa kalır.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { ChevronDown, Check } from '../../../../core/ui/icons';
import { HatchFill } from '../../../../core/ui/HatchFill';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { HERO_NAVY } from '../../../../core/ui/HeroGlow';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../../core/theme/usePanelTheme';
import { hexA } from '../../../../core/theme/stationPalette';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { printLocale } from '../../../../core/i18n/printLocale';
import { monthLabel, type MonthKey } from '../months';
import type { TrendPoint } from '../aggregate';
import { barPct, splitChips, scrollOffsetFor } from '../overview';
import { useSpringValue } from '../useSpringValue';
import { AnchoredPopover, measureAnchor, type AnchorRect } from './AnchoredPopover';

const web = Platform.OS === 'web';
const COL_MIN_W = 46;
const CHART_H = 190;

export interface TrendChartProps {
  points: TrendPoint[];
  selected: MonthKey;
  onSelect(m: MonthKey): void;
  showLastYear: boolean;
  /** Penceredeki iş tipleri, çoktan aza (ilk 6 çip, kalanı "Diğer…"). */
  chips: string[];
  chip: string | null;
  onChip(c: string | null): void;
  /** Sütun birimi (çevrilmiş): "üye" / "çene" / "adet". */
  unitLabel: string;
}

/** Sütun ve çizgi renkleri — koyu zeminde okunur mavi tondan türetilir. */
function useChartTones() {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const base = U.isDark ? '#93C5FD' : accent;
  return {
    selected: base,
    soft: hexA(base, U.isDark ? 0.32 : 0.33),
    softHover: hexA(base, U.isDark ? 0.45 : 0.48),
    rail: hexA(base, U.isDark ? 0.05 : 0.03),
    railHover: hexA(base, U.isDark ? 0.10 : 0.07),
    stripe: hexA(base, U.isDark ? 0.10 : 0.08),
    hatch: base,
    marker: U.ink[700],
  };
}

export function TrendChart(p: TrendChartProps) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const reduced = useReducedMotion();
  const tones = useChartTones();
  const locale = printLocale();

  const max = useMemo(() => {
    let m = 1;
    for (const pt of p.points) {
      if (pt.value != null && pt.value > m) m = pt.value;
      if (p.showLastYear && pt.lastYear != null && pt.lastYear > m) m = pt.lastYear;
    }
    return m;
  }, [p.points, p.showLastYear]);

  // ── Yatay kaydırma (dar alan) ──
  const [viewW, setViewW] = useState(0);
  const n = Math.max(p.points.length, 1);
  const contentW = Math.max(viewW, n * COL_MIN_W);
  const scrolls = viewW > 0 && contentW > viewW + 1;
  const scrollRef = useRef<ScrollView>(null);
  const selIdx = p.points.findIndex((pt) => pt.month === p.selected);
  useEffect(() => {
    if (!scrolls || selIdx < 0) return;
    const colW = contentW / n;
    scrollRef.current?.scrollTo({ x: scrollOffsetFor(selIdx, colW, viewW, contentW), animated: !reduced });
  }, [scrolls, selIdx, contentW, viewW, n, reduced]);

  const columns = (
    <View
      style={{
        flexDirection: 'row', alignItems: 'stretch', height: CHART_H,
        width: scrolls ? contentW : '100%',
        // Zaman ekseni RTL'de de soldan sağa (spec §9)
        direction: 'ltr',
      } as any}
    >
      {/* Anahtar = sütun yuvası (ay değil): pencere kayınca her yuva kendi
          mevcut yüksekliğinden yeni değerine yayla akar, yeniden doğmaz. */}
      {p.points.map((pt, i) => (
        <TrendColumn
          key={i}
          point={pt}
          max={max}
          selected={pt.month === p.selected}
          showLastYear={p.showLastYear}
          shortLabel={monthLabel(pt.month, locale, 'short')}
          longLabel={monthLabel(pt.month, locale, 'long')}
          unitLabel={p.unitLabel}
          tones={tones}
          onPress={() => p.onSelect(pt.month)}
        />
      ))}
    </View>
  );

  return (
    <View style={{ ...U.cardSolid, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>Aylık trend</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400] }}>
          {p.unitLabel}
        </Text>
        <View style={{ flex: 1 }} />
        {p.showLastYear ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: tones.marker }} />
            <Text style={{ fontSize: 11.5, color: U.ink[500] }}>Geçen yıl</Text>
          </View>
        ) : null}
      </View>

      <ChipRow chips={p.chips} chip={p.chip} onChip={p.onChip} accent={accent} />

      <View onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
        {scrolls ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces
            style={{ direction: 'ltr' } as any}
          >
            {columns}
          </ScrollView>
        ) : columns}
      </View>
    </View>
  );
}

function TrendColumn({ point, max, selected, showLastYear, shortLabel, longLabel, unitLabel, tones, onPress }: {
  point: TrendPoint; max: number; selected: boolean; showLastYear: boolean;
  shortLabel: string; longLabel: string; unitLabel: string;
  tones: ReturnType<typeof useChartTones>; onPress(): void;
}) {
  const U = useInkUI();
  const noRecord = point.value == null;
  const showMarker = showLastYear && point.lastYear != null;
  const h = useSpringValue(barPct(point.value, max, 6));
  const ly = useSpringValue(showMarker ? barPct(point.lastYear, max, 0) : 0);
  const fillStyle = useAnimatedStyle(() => ({ height: `${h.value}%` as any }));
  const markerStyle = useAnimatedStyle(() => ({ bottom: `${ly.value}%` as any }));

  const a11y = noRecord
    ? `${longLabel}: ${autoT('kayıt yok')}`
    : `${longLabel}: ${point.value} ${unitLabel}${showMarker ? ` · ${autoT('Geçen yıl')} ${point.lastYear}` : ''}`;

  const col = (
    <Pressable
      onPress={noRecord ? undefined : onPress}
      disabled={noRecord}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled: noRecord }}
      style={({ pressed }: any) => ({
        flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 6,
        transform: [{ scale: pressed && !noRecord ? 0.97 : 1 }],
        ...(web ? { cursor: noRecord ? 'default' : 'pointer' } as any : {}),
      })}
    >
      {({ hovered }: any) => (
        <>
          <View
            style={{
              flex: 1, width: '100%', maxWidth: 44, borderRadius: 999, overflow: 'hidden', position: 'relative',
              ...(noRecord
                ? { borderWidth: 1, borderStyle: 'dashed', borderColor: U.ink[300], backgroundColor: 'transparent' }
                : {
                  backgroundColor: hovered ? tones.railHover : tones.rail,
                  ...(web ? { backgroundImage: `repeating-linear-gradient(135deg, ${tones.stripe} 0 6px, transparent 6px 12px)` } as any : {}),
                }),
            } as any}
          >
            {noRecord ? null : <HatchFill color={tones.hatch} />}
            {noRecord ? null : (
              <Animated.View
                style={[{
                  position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 999,
                  backgroundColor: selected ? tones.selected : hovered ? tones.softHover : tones.soft,
                }, fillStyle]}
              />
            )}
            {showMarker ? (
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: 5, right: 5, height: 2, borderRadius: 1, backgroundColor: tones.marker, opacity: 0.75 }, markerStyle]}
              />
            ) : null}
          </View>
          {/* Genişlik sütuna bağlı: uzun "kayıt yok" çevirileri komşu sütuna taşmaz */}
          <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 1, minHeight: 30 }}>
            <Text
              numberOfLines={1}
              style={{
                alignSelf: 'stretch', textAlign: 'center',
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.55,
                fontWeight: selected ? '700' : '500', color: selected ? U.ink[900] : U.ink[400],
              }}
            >
              {shortLabel}
            </Text>
            {noRecord ? (
              <Text numberOfLines={2} style={{ alignSelf: 'stretch', textAlign: 'center', fontSize: 9.5, lineHeight: 11, color: U.ink[400] }}>kayıt yok</Text>
            ) : (
              <Text style={{ fontSize: 12, fontWeight: selected ? '700' : '500', color: selected ? U.ink[900] : U.ink[500], fontVariant: ['tabular-nums'] }}>
                {String(point.value)}
              </Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );

  // Sarmalayıcı hep var (yalnız `enabled` değişir) → kıyas değişince sütun yeniden
  // doğmaz, yayı kesilmez.
  return (
    <GlassTooltip
      title={longLabel}
      text={`${autoT('Geçen yıl')}: ${point.lastYear ?? '—'} ${unitLabel}`}
      enabled={showMarker}
      style={{ flex: 1 }}
    >
      {col}
    </GlassTooltip>
  );
}

/** "Tümü" + ilk 6 iş tipi + "Diğer…" menüsü. §1c kaydırmalı şerit pill ölçüsü. */
function ChipRow({ chips, chip, onChip, accent }: {
  chips: string[]; chip: string | null; onChip(c: string | null): void; accent: string;
}) {
  const U = useInkUI();
  const moreRef = useRef<any>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [open, setOpen] = useState(false);
  const { visible, overflow } = splitChips(chips);
  const chipInOverflow = chip != null && overflow.includes(chip);

  const pill = (key: string, label: string, on: boolean, onPress: () => void, extra?: React.ReactNode, ref?: any) => (
    <Pressable
      key={key}
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
        backgroundColor: on ? (U.isDark ? HERO_NAVY.light : accent) : hovered ? U.plainBtn.hoverBg : U.plainBtn.bg,
        borderWidth: 1, borderColor: on ? 'transparent' : U.plainBtn.border,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(web ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? (U.isDark ? '#FFFFFF' : onAccentInk(accent)) : U.plainBtn.fg }}>
        {label}
      </Text>
      {extra}
    </Pressable>
  );

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {pill('__all__', autoT('Tümü'), chip == null, () => onChip(null))}
        {visible.map((c) => pill(c, autoT(c), chip === c, () => onChip(chip === c ? null : c)))}
        {overflow.length > 0
          ? pill(
            '__more__',
            chipInOverflow ? autoT(chip!) : autoT('Diğer…'),
            chipInOverflow,
            () => measureAnchor(moreRef.current, (a) => { setAnchor(a); setOpen(true); }),
            <ChevronDown size={13} color={chipInOverflow ? (U.isDark ? '#FFFFFF' : onAccentInk(accent)) : U.plainBtn.fgMuted} strokeWidth={2} />,
            moreRef,
          )
          : null}
      </ScrollView>
      <AnchoredPopover visible={open} anchor={anchor} onClose={() => setOpen(false)} width={260} maxHeight={360}>
        <ScrollView contentContainerStyle={{ padding: 6 }}>
          {overflow.map((c) => {
            const on = chip === c;
            const tint = U.isDark ? '#93C5FD' : accent;
            return (
              <Pressable
                key={c}
                onPress={() => { onChip(on ? null : c); setOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed, hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: on ? hexA(tint, 0.14) : hovered || pressed ? U.rowHover : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                  ...(web ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: on ? '700' : '500', color: on ? tint : U.ink[800] }}>
                  {autoT(c)}
                </Text>
                {on ? <Check size={14} color={tint} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </AnchoredPopover>
    </>
  );
}
