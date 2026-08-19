/**
 * Mali İşlemler — Grafik bileşenleri (saf SVG, ekstra paket yok).
 *
 * MonthlyFlowChart — son 6 ay kesilen vs ödenen grouped bar
 * AgingBarChart    — yaşlandırma yatay stacked bar
 * MethodDonut      — son 90 gün tahsilat yöntemi donut
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, G, Line, Text as SvgText, Path, Circle } from 'react-native-svg';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { DISPLAY } from './atoms';
import type { MonthlyFlowPoint, AgingBucket, MethodSlice } from '../api';

// Katı per-currency: grafik ekseni/etiketi verilen para biriminin sembolüyle.
const sym = (cur?: string) => CURRENCY_META[(cur || getBaseCurrency()) as Currency]?.symbol ?? baseSymbol();
const compactCur = (nRaw: number, cur?: string): string => {
  const n = Number(nRaw) || 0;   // undefined/NaN → 0 (ham toLocaleString çökmesi)
  const s = sym(cur);
  const v = Math.abs(n);
  if (v >= 1_000_000) return s + (n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'M';
  if (v >= 1_000)     return s + (n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + 'K';
  return s + n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
};

/* ─────────────────────────────  MonthlyFlowChart  ────────────────────── */

export function MonthlyFlowChart({ data, height = 220, currency }: { data: MonthlyFlowPoint[]; height?: number; currency?: string }) {
  const TH = usePanelTheme();
  const W = 600;           // viewBox width — responsive via preserveAspectRatio
  const H = height;
  const PAD_T = 24, PAD_B = 36, PAD_L = 48, PAD_R = 12;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const max = useMemo(() => {
    const m = Math.max(...data.flatMap(d => [d.invoiced, d.paid]), 1);
    // güzel yuvarlak üst sınır
    const exp = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / exp) * exp;
  }, [data]);

  const bandW = innerW / data.length;
  const barW  = Math.min(18, bandW / 3);

  const yScale = (v: number) => PAD_T + innerH - (v / max) * innerH;

  // Y ekseni grid'i (4 hat)
  const grids = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    v: max * t,
    y: PAD_T + innerH - t * innerH,
  }));

  return (
    <View style={{ width: '100%' }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Grid */}
        {grids.map((g, i) => (
          <G key={i}>
            <Line x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y} stroke={DS.ink[100]} strokeWidth={1} />
            <SvgText x={PAD_L - 6} y={g.y + 3} fontSize={9} fill={DS.ink[400]} textAnchor="end">
              {compactCur(g.v, currency)}
            </SvgText>
          </G>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const x0 = PAD_L + i * bandW + bandW / 2;
          const yInv = yScale(d.invoiced);
          const yPay = yScale(d.paid);
          const hInv = PAD_T + innerH - yInv;
          const hPay = PAD_T + innerH - yPay;
          return (
            <G key={d.month}>
              {/* Invoiced (ink) */}
              <Rect
                x={x0 - barW - 1}
                y={yInv}
                width={barW}
                height={Math.max(0, hInv)}
                rx={3}
                fill={DS.ink[800]}
              />
              {/* Paid (panel theme) */}
              <Rect
                x={x0 + 1}
                y={yPay}
                width={barW}
                height={Math.max(0, hPay)}
                rx={3}
                fill={TH.primary}
              />
              {/* Ay etiketi */}
              <SvgText
                x={x0}
                y={H - PAD_B + 18}
                fontSize={11}
                fill={DS.ink[500]}
                fontWeight="600"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, paddingStart: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: DS.ink[800] }} />
          <Text style={{ fontSize: 11, color: DS.ink[700], fontWeight: '500' }}>Kesilen Fatura</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: TH.primary }} />
          <Text style={{ fontSize: 11, color: DS.ink[700], fontWeight: '500' }}>Tahsil Edilen</Text>
        </View>
      </View>
    </View>
  );
}

/* ─────────────────────────────  AgingBarChart  ───────────────────────── */

const AGING_COLORS: Record<AgingBucket['key'], string> = {
  current: '#94A3B8',  // gri-mavi
  d30:     '#F59E0B',  // amber
  d60:     '#F97316',  // turuncu
  d90:     '#EF4444',  // kırmızı
  d90p:    '#9C2E2E',  // koyu kırmızı
};

export function AgingBarChart({ buckets, currency }: { buckets: AgingBucket[]; currency?: string }) {
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  if (total === 0) {
    return (
      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: DS.ink[400] }}>Açık fatura yok</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Stacked bar */}
      <View style={{
        flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden',
        borderWidth: 1, borderColor: DS.ink[100],
      }}>
        {buckets.map(b => {
          const pct = (b.amount / total) * 100;
          if (pct <= 0) return null;
          return (
            <View
              key={b.key}
              style={{
                width: `${pct}%`,
                backgroundColor: AGING_COLORS[b.key],
              }}
            />
          );
        })}
      </View>

      {/* Legend rows */}
      <View style={{ gap: 6 }}>
        {buckets.map(b => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0;
          return (
            <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: AGING_COLORS[b.key] }} />
              <Text style={{ flex: 1, fontSize: 12, color: DS.ink[800], fontWeight: '500' }}>{b.label}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], width: 60, textAlign: 'end' as any }}>{b.count} fat.</Text>
              <Text style={{ ...DISPLAY, fontSize: 13, color: DS.ink[900], width: 90, textAlign: 'end' as any, letterSpacing: -0.2 }}>
                {compactCur(b.amount, currency)}
              </Text>
              <Text style={{ fontSize: 10, color: DS.ink[400], width: 38, textAlign: 'end' as any }}>%{pct.toFixed(0)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ─────────────────────────────  MethodDonut  ─────────────────────────── */

const DONUT_PALETTE = ['#0F172A', '#0EA5E9', '#7C3AED', '#D97706', '#059669', '#DC2626'];

export function MethodDonut({ slices, size = 160, currency }: { slices: MethodSlice[]; size?: number; currency?: string }) {
  const total = slices.reduce((s, x) => s + x.amount, 0);

  if (total === 0) {
    return (
      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: DS.ink[400] }}>Tahsilat yok</Text>
      </View>
    );
  }

  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 6;
  const inner = r * 0.62;

  let acc = 0;
  const segs = slices.map((s, i) => {
    const start = acc;
    acc += s.amount / total;
    const end = acc;
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = end   * 2 * Math.PI - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const ix1 = cx + Math.cos(a1) * inner;
    const iy1 = cy + Math.sin(a1) * inner;
    const ix0 = cx + Math.cos(a0) * inner;
    const iy0 = cy + Math.sin(a0) * inner;
    const d = [
      `M ${x0} ${y0}`,
      `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
      `L ${ix1} ${iy1}`,
      `A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0}`,
      'Z',
    ].join(' ');
    return { d, color: DONUT_PALETTE[i % DONUT_PALETTE.length], slice: s };
  });

  return (
    <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <Svg width={size} height={size}>
        {segs.map((s, i) => <Path key={i} d={s.d} fill={s.color} />)}
        <Circle cx={cx} cy={cy} r={inner - 1} fill="#FFF" />
      </Svg>
      <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
        <Text style={{ fontSize: 10, color: DS.ink[400], textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700' }}>
          Toplam · son 90 gün
        </Text>
        <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>
          {compactCur(total, currency)}
        </Text>
        <View style={{ marginTop: 6, gap: 4 }}>
          {segs.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: s.color }} />
              <Text style={{ flex: 1, fontSize: 11, color: DS.ink[700], fontWeight: '500' }}>{s.slice.label}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{compactCur(s.slice.amount, currency)}</Text>
              <Text style={{ fontSize: 10, color: DS.ink[400], width: 36, textAlign: 'end' as any }}>
                %{((s.slice.amount / total) * 100).toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
