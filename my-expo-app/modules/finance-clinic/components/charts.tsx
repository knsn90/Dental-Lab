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
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
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
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Genişliği ÖLÇ. Sabit viewBox (600) + width="100%" kullanılınca SVG
  // yüksekliğe sığacak şekilde ölçekleniyor ve kartın sağında kocaman ölü
  // alan kalıyordu (kullanıcı ekranda gördü). Ölçülen genişlik viewBox'a
  // birebir verilince grafik kartı dolduruyor, yazılar da ölçeklenmiyor.
  const [w, setW] = React.useState(0);

  const H = height;
  const PAD_T = 16, PAD_B = 30, PAD_L = 44, PAD_R = 8;
  const innerW = Math.max(0, w - PAD_L - PAD_R);
  const innerH = H - PAD_T - PAD_B;

  const hasAny = useMemo(
    () => data.some(d => (Number(d.invoiced) || 0) > 0 || (Number(d.paid) || 0) > 0),
    [data],
  );

  const max = useMemo(() => {
    const m = Math.max(...data.flatMap(d => [d.invoiced, d.paid]), 1);
    const exp = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / exp) * exp;
  }, [data]);

  const bandW = data.length ? innerW / data.length : 0;
  // Çubuk kalınlığı bantla birlikte büyür: dar kartta incelir, geniş kartta
  // cetvel gibi uzayıp saçmalamaz.
  const barW = Math.max(6, Math.min(22, bandW * 0.26));
  const gap  = Math.max(2, barW * 0.22);

  const yScale = (v: number) => PAD_T + innerH - ((Number(v) || 0) / max) * innerH;

  // Üç iç çizgi yeter; en üstteki sınır çizgisi grafiği kafesliyordu.
  const grids = [0, 0.33, 0.66, 1].map(t => ({ v: max * t, y: PAD_T + innerH - t * innerH }));

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : DS.ink[100];
  const axisInk   = isDark ? (T.ink3 as string) : DS.ink[400];
  const monthInk  = isDark ? (T.ink3 as string) : DS.ink[500];
  // HİYERARŞİ: kesilen fatura BAĞLAM, ödenen İLERLEME. Eskiden kesilen
  // neredeyse siyahtı (ink[800]) ve kartı o dolduruyordu; oysa kartın
  // konusu ödeme oranı. Bağlam geri çekildi, ödenen öne çıktı.
  const invoicedFill = isDark ? 'rgba(255,255,255,0.16)' : DS.ink[200];
  const paidFill     = TH.primary;

  return (
    <View style={{ width: '100%' }} onLayout={e => setW(Math.round(e.nativeEvent.layout.width))}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          {grids.map((g, i) => (
            <G key={i}>
              <Line
                x1={PAD_L} y1={g.y} x2={w - PAD_R} y2={g.y}
                stroke={i === 0 ? (isDark ? 'rgba(255,255,255,0.14)' : DS.ink[200]) : gridColor}
                strokeWidth={1}
              />
              <SvgText x={PAD_L - 8} y={g.y + 3} fontSize={9.5} fill={axisInk} textAnchor="end">
                {compactCur(g.v, currency)}
              </SvgText>
            </G>
          ))}

          {hasAny && data.map((d, i) => {
            const cx   = PAD_L + i * bandW + bandW / 2;
            const yInv = yScale(d.invoiced);
            const yPay = yScale(d.paid);
            const hInv = Math.max(0, PAD_T + innerH - yInv);
            const hPay = Math.max(0, PAD_T + innerH - yPay);
            const isLast = i === data.length - 1;
            return (
              <G key={d.month}>
                {/* İçinde bulunulan ay sessizce işaretlenir — kullanıcı
                    "şimdi neredeyim" sorusunu etiketi okumadan yanıtlasın. */}
                {isLast && (
                  <Rect
                    x={PAD_L + i * bandW} y={PAD_T - 6}
                    width={bandW} height={innerH + 6} rx={10}
                    fill={isDark ? 'rgba(255,255,255,0.04)' : DS.ink[50]}
                  />
                )}
                {hInv > 0 && (
                  <Rect x={cx - barW - gap / 2} y={yInv} width={barW} height={hInv} rx={Math.min(4, barW / 2)} fill={invoicedFill} />
                )}
                {hPay > 0 && (
                  <Rect x={cx + gap / 2} y={yPay} width={barW} height={hPay} rx={Math.min(4, barW / 2)} fill={paidFill} />
                )}
                <SvgText
                  x={cx} y={H - PAD_B + 17} fontSize={10.5}
                  fill={isLast ? (isDark ? (T.ink2 as string) : DS.ink[700]) : monthInk}
                  fontWeight={isLast ? '600' : '500'}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}

      {/* Veri yoksa boş kafes çizip "sıfır" izlenimi vermek yerine söylenir. */}
      {!hasAny && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: H, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12.5, color: axisInk }}>Bu dönemde hareket yok</Text>
        </View>
      )}

      {/* Gösterge — kare yerine nokta, ölçüler küçültüldü: kartın konusu
          grafiğin kendisi, gösterge yalnız anahtar. */}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, paddingStart: PAD_L - 8 }}>
        {[
          { c: invoicedFill, l: 'Kesilen Fatura' },
          { c: paidFill,     l: 'Ödenen' },
        ].map(k => (
          <View key={k.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: k.c }} />
            <Text style={{ fontSize: 11, letterSpacing: 0.1, color: isDark ? (T.ink2 as string) : DS.ink[500], fontWeight: '500' }}>
              {k.l}
            </Text>
          </View>
        ))}
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
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  if (total === 0) {
    return (
      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: isDark ? (T.ink3 as string) : DS.ink[400] }}>Açık fatura yok</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Stacked bar */}
      <View style={{
        flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden',
        borderWidth: 1, borderColor: isDark ? T.hairline : DS.ink[100],
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
              <Text style={{ flex: 1, fontSize: 12, color: isDark ? (T.ink2 as string) : DS.ink[800], fontWeight: '500' }}>{b.label}</Text>
              <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500], width: 60, textAlign: 'end' as any }}>{b.count} fat.</Text>
              <Text style={{ ...DISPLAY, fontSize: 13, color: isDark ? T.ink : DS.ink[900], width: 90, textAlign: 'end' as any, letterSpacing: -0.2 }}>
                {compactCur(b.amount, currency)}
              </Text>
              <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[400], width: 38, textAlign: 'end' as any }}>%{pct.toFixed(0)}</Text>
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
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const total = slices.reduce((s, x) => s + x.amount, 0);

  if (total === 0) {
    return (
      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: isDark ? (T.ink3 as string) : DS.ink[400] }}>Tahsilat yok</Text>
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
        <Circle cx={cx} cy={cy} r={inner - 1} fill={isDark ? (T.card as string) : '#FFF'} />
      </Svg>
      <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
        <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[400], textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700' }}>
          Toplam · son 90 gün
        </Text>
        <Text style={{ ...DISPLAY, fontSize: 22, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.5 }}>
          {compactCur(total, currency)}
        </Text>
        <View style={{ marginTop: 6, gap: 4 }}>
          {segs.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: s.color }} />
              <Text style={{ flex: 1, fontSize: 11, color: isDark ? (T.ink2 as string) : DS.ink[700], fontWeight: '500' }}>{s.slice.label}</Text>
              <Text style={{ fontSize: 11, color: isDark ? (T.ink3 as string) : DS.ink[500] }}>{compactCur(s.slice.amount, currency)}</Text>
              <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[400], width: 36, textAlign: 'end' as any }}>
                %{((s.slice.amount / total) * 100).toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
