/**
 * Isı haritası sekmesi (spec §7.5): satırlar iş tipi ya da klinik, sütunlar
 * seçili ayla biten 12 ay. Hücre zemininin yoğunluğu SATIRIN kendi en büyük
 * değerine göredir (her satır kendi ölçeğinde); 0 → nötr zemin, `null`
 * (kayıt dönemi dışı) → kesik çerçeve "—". Satır adı sütunu yatay kaydırmanın
 * DIŞINDA durur → kaydırırken sabit kalır. Çene/adet birimli satırlar birimi
 * adın yanında taşır. Dolu hücreye basınca o hücrenin siparişleri açılır.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { hexA } from '../../../../core/theme/stationPalette';
import { HERO_NAVY } from '../../../../core/ui/HeroGlow';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { EmptyStateX } from '../../../../core/ui/EmptyStateX';
import { PAGE_PADDING } from '../../../../core/ui/pageMetrics';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import type { MonthKey } from '../months';
import type { HeatAxis, HeatRow } from '../aggregate';
import { HEAT_ALPHA, HEAT_LEVELS, heatLevel, heatStrong, heatInk } from '../heatmap';

const web = Platform.OS === 'web';
const cursor = (on: boolean) => (web ? ({ cursor: on ? 'pointer' : 'default' } as any) : {});

const ROW_H = 40;
const CELL_H = 34;
const HEAD_H = 28;
const GAP = 4;
const CELL_MIN = 52;
const CARD_PAD = 16;

export interface HeatmapTabProps {
  rows: HeatRow[];
  months: MonthKey[];
  monthLabels: string[];
  axis: HeatAxis;
  onAxis(a: HeatAxis): void;
  onCell(month: MonthKey, key: string): void;
  /** Ekran okuyucu için uzun ay adları (opsiyonel; yoksa kısa ad). */
  monthLongLabels?: string[];
}

/** Hücre zemininin taban tonu: açık temada panel accent'i, koyuda okunur açık mavi. */
function useHeatBase(): string {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  return U.isDark ? '#93C5FD' : accent;
}

export function HeatmapTab({ rows, months, monthLabels, axis, onAxis, onCell, monthLongLabels }: HeatmapTabProps) {
  const U = useInkUI();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 768;
  const nameW = narrow ? 124 : 200;

  // Genişlik ilk karede pencereden tohumlanır (ölçüm gelene dek), sonra onLayout.
  const [tableW, setTableW] = useState(() => Math.max(0, winW - 2 * (PAGE_PADDING + CARD_PAD)));
  const n = Math.max(months.length, 1);
  const gridAvail = Math.max(0, tableW - nameW);
  const minGrid = n * CELL_MIN + (n - 1) * GAP;
  const scrolls = gridAvail > 0 && minGrid > gridAvail + 1;
  const cellW = scrolls ? CELL_MIN : Math.max(CELL_MIN, (gridAvail - (n - 1) * GAP) / n);
  const gridW = n * cellW + (n - 1) * GAP;

  // Seçili ay en sağdaki sütundur → kaydırılabiliyorsa onu görünür tut.
  const scrollRef = useRef<ScrollView>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!scrolls) return;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, [scrolls, gridW, months[months.length - 1], axis]);

  const seg = (a: HeatAxis, label: string) => {
    const on = axis === a;
    return (
      <Pressable
        key={a}
        onPress={() => onAxis(a)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={({ pressed }: any) => ({
          // §1c kaydırmalı şerit: pasif 12 / aktif 18, dikey 8
          paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
          backgroundColor: on ? U.segActive : 'transparent',
          ...(on && web ? { boxShadow: U.isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.12)' } as any : {}),
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...cursor(true),
        })}
      >
        <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[500] }}>{label}</Text>
      </Pressable>
    );
  };

  const lastIdx = months.length - 1;

  return (
    <View style={{ ...U.cardSolid, padding: CARD_PAD, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1, minWidth: 160, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>Isı haritası</Text>
          <Text style={{ fontSize: 12, color: U.ink[500] }}>Her satır kendi en büyük değerine göre renklenir</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View
          accessibilityRole="tablist"
          style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral }}
        >
          {seg('workType', autoT('İş tipi'))}
          {seg('clinic', autoT('Klinik'))}
        </View>
      </View>

      {rows.length === 0 ? (
        <EmptyStateX icon="inbox" title="Bu dönemde sipariş yok" compact />
      ) : (
        <View
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            if (w > 0 && Math.abs(w - tableW) > 1) setTableW(w);
          }}
          // Zaman ekseni RTL'de de soldan sağa (spec §9)
          style={{ flexDirection: 'row', direction: 'ltr' } as any}
        >
          {/* Sabit satır adı sütunu (kaydırmanın dışında) */}
          <View
            style={{
              width: nameW, paddingRight: 10,
              borderRightWidth: 1, borderRightColor: scrolled ? U.hairline : 'transparent',
              ...(web ? { transition: 'border-color 160ms ease-out' } as any : {}),
            }}
          >
            <View style={{ height: HEAD_H, justifyContent: 'center' }}>
              <Text numberOfLines={1} style={{ textAlign: isRTL() ? 'right' : 'left', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400] }}>
                {axis === 'workType' ? autoT('İş tipi') : `${autoT('Klinik')} · ${autoT('üye')}`}
              </Text>
            </View>
            {rows.map((r) => <RowName key={r.key} row={r} axis={axis} />)}
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            scrollEnabled={scrolls}
            bounces={scrolls}
            showsHorizontalScrollIndicator={scrolls}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              // Son sütuna kaydırılmış başlangıç durumunda da ayırıcı görünür
              setScrolled(scrolls && x > 0.5);
            }}
            style={{ flex: 1 }}
            contentContainerStyle={{ width: gridW }}
          >
            <View style={{ width: gridW }}>
              <View style={{ height: HEAD_H, flexDirection: 'row', gap: GAP, alignItems: 'center' }}>
                {months.map((m, i) => (
                  <Text
                    key={m}
                    numberOfLines={1}
                    style={{
                      width: cellW, textAlign: 'center', fontSize: 11.5,
                      fontWeight: i === lastIdx ? '700' : '500',
                      color: i === lastIdx ? U.ink[900] : U.ink[500],
                    }}
                  >
                    {monthLabels[i] ?? m}
                  </Text>
                ))}
              </View>
              {rows.map((r) => (
                <View key={r.key} style={{ height: ROW_H, flexDirection: 'row', gap: GAP, alignItems: 'center' }}>
                  {r.cells.map((v, i) => (
                    <HeatCell
                      key={months[i]}
                      value={v}
                      max={r.max}
                      count={r.counts[i] ?? 0}
                      width={cellW}
                      a11yLabel={`${autoT(r.label)} · ${monthLongLabels?.[i] ?? monthLabels[i] ?? months[i]}`}
                      unit={autoT(r.unitLabel)}
                      onPress={() => onCell(months[i], r.key)}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {rows.length > 0 ? <Legend /> : null}
    </View>
  );
}

function RowName({ row, axis }: { row: HeatRow; axis: HeatAxis }) {
  const U = useInkUI();
  const label = autoT(row.label);
  // Birim yalnız üye DIŞI satırlarda adın yanında (çene/adet…); klinik ekseni hep üye.
  const unit = axis === 'workType' && row.unitLabel !== 'üye' ? autoT(row.unitLabel) : null;
  return (
    // Tablo `direction: ltr` (zaman ekseni); RTL'de ad sütunun sağına yaslanır, birim adın solunda.
    <View style={{ height: ROW_H, flexDirection: isRTL() ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
      <GlassTooltip title={label} text={unit ? `${autoT('Birim')}: ${unit}` : `${autoT('Birim')}: ${autoT('üye')}`} placement="right" style={{ flexShrink: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ textAlign: isRTL() ? 'right' : 'left', fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{label}</Text>
      </GlassTooltip>
      {unit ? (
        <Text style={{ flexShrink: 0, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[400] }}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function HeatCell({ value, max, count, width, a11yLabel, unit, onPress }: {
  value: number | null; max: number; count: number; width: number; a11yLabel: string; unit: string; onPress(): void;
}) {
  const U = useInkUI();
  const base = useHeatBase();
  const level = heatLevel(value, max);

  if (level === null) {
    return (
      <View
        accessibilityLabel={`${a11yLabel}: ${autoT('kayıt yok')}`}
        style={{
          width, height: CELL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderStyle: 'dashed', borderColor: U.ink[300],
        }}
      >
        <Text style={{ fontSize: 12, color: U.ink[400] }}>—</Text>
      </View>
    );
  }

  const strong = heatStrong(level);
  const bg = level === 0 ? U.chipNeutral : hexA(base, HEAT_ALPHA[level]);
  // Metin rengi hesapla: zemin üstünde en yüksek karşıtlık (≥4.5:1, heatmap.test)
  const fg = level === 0
    ? (count > 0 ? U.ink[500] : U.ink[400])
    : heatInk(base, HEAT_ALPHA[level], U.surface, U.isDark ? [U.ink[900], HERO_NAVY.from] : [U.ink[900], '#FFFFFF']);
  const text = (
    <Text style={{ fontSize: 12.5, fontWeight: strong ? '700' : '600', color: fg, fontVariant: ['tabular-nums'] }}>
      {String(value)}
    </Text>
  );

  // Değer 0 ama sipariş var (ör. klinik o ay yalnız çene/adet gönderdi) → açılabilir;
  // altta küçük nokta "burada sipariş var" der.
  if (level === 0 && count > 0) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${a11yLabel}: 0 ${unit} · ${count} ${autoT('sipariş')} · ${autoT('Siparişleri göster')}`}
        style={({ pressed, hovered }: any) => ({
          width, height: CELL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: 1.5, borderColor: hovered || pressed ? hexA(base, U.isDark ? 0.9 : 0.85) : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...cursor(true),
        })}
      >
        {text}
        <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: hexA(base, U.isDark ? 0.9 : 0.8) }} />
      </Pressable>
    );
  }

  if (level === 0) {
    return (
      <View
        accessibilityLabel={`${a11yLabel}: 0 ${unit}`}
        style={{ width, height: CELL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}
      >
        {text}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11yLabel}: ${value} ${unit} · ${autoT('Siparişleri göster')}`}
      style={({ pressed, hovered }: any) => ({
        width, height: CELL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg,
        borderWidth: 1.5, borderColor: hovered || pressed ? hexA(base, U.isDark ? 0.9 : 0.85) : 'transparent',
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...cursor(true),
      })}
    >
      {text}
    </Pressable>
  );
}

function Legend() {
  const U = useInkUI();
  const base = useHeatBase();
  const sw = (key: string, bg: string, dashed = false) => (
    <View
      key={key}
      style={{
        width: 16, height: 12, borderRadius: 4, backgroundColor: bg,
        ...(dashed ? { borderWidth: 1, borderStyle: 'dashed', borderColor: U.ink[300] } : {}),
      }}
    />
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Text style={{ fontSize: 11.5, color: U.ink[500] }}>Az</Text>
      {sw('z', U.chipNeutral)}
      {Array.from({ length: HEAT_LEVELS }, (_, i) => sw(`l${i + 1}`, hexA(base, HEAT_ALPHA[i + 1])))}
      <Text style={{ fontSize: 11.5, color: U.ink[500] }}>Çok</Text>
      <View style={{ width: 10 }} />
      {sw('n', 'transparent', true)}
      <Text style={{ fontSize: 11.5, color: U.ink[500] }}>kayıt yok</Text>
    </View>
  );
}
