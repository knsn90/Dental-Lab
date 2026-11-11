/**
 * Seçili ayın dört kutusu (spec §7.4): Toplam üye · Çene · Adet · 6 ay ort.
 * İlk üçünün altında kıyas farkı ("−21 · Eki 84"); kıyas yoksa "— · …kayıt yok".
 * Fark yönü yalnız renkle değil, işaret + ikon + ekran okuyucu metniyle de okunur.
 * Rakamlar Inter Tight 300, tabular-nums, yayla akar. Dar ekranda 2×2.
 */
import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { TrendingUp, TrendingDown } from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { DS } from '../../../../core/theme/dsTokens';
import { CARD_GAP } from '../../../../core/ui/pageMetrics';
import { autoT } from '../../../../core/i18n/autoTranslate';
import type { CompareMode } from '../months';
import type { Qty } from '../aggregate';
import { diffOf, kpiDiffText } from '../overview';
import { AnimatedNumber } from './AnimatedNumber';

export interface MonthKpisProps {
  qty: Qty | null;
  compare: Qty | null;
  compareMode: CompareMode;
  /** Kıyas ayının kısa adı ("Eki"). */
  compareMonthText: string;
  avg6: number | null;
}

const NUM = 34;

export function MonthKpis({ qty, compare, compareMode, compareMonthText, avg6 }: MonthKpisProps) {
  const { width } = useWindowDimensions();
  const narrow = width < 768;
  const noRecord = compareMode === 'lastYear'
    ? autoT('geçen yılın bu ayına ait kayıt yok')
    : autoT('önceki aya ait kayıt yok');
  const q = qty ?? { uye: 0, cene: 0, adet: 0 };
  const box = { flexGrow: 1, flexBasis: narrow ? '40%' : 0, minWidth: narrow ? 140 : 0 } as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: narrow ? 'wrap' : 'nowrap', gap: CARD_GAP }}>
      <Kpi label={autoT('Toplam üye')} value={q.uye} cmp={compare?.uye ?? null} cmpText={compareMonthText} noRecord={noRecord} style={box} />
      <Kpi label={autoT('Çene')} value={q.cene} cmp={compare?.cene ?? null} cmpText={compareMonthText} noRecord={noRecord} style={box} />
      <Kpi label={autoT('Adet')} value={q.adet} cmp={compare?.adet ?? null} cmpText={compareMonthText} noRecord={noRecord} style={box} />
      <Kpi label={autoT('6 ay ort.')} value={avg6} decimals={1} caption={autoT('üye/ay')} style={box} />
    </View>
  );
}

function Kpi({ label, value, decimals = 0, cmp, cmpText, noRecord, caption, style }: {
  label: string; value: number | null; decimals?: number;
  cmp?: number | null; cmpText?: string; noRecord?: string; caption?: string; style: any;
}) {
  const U = useInkUI();
  const hasDiff = noRecord !== undefined;
  const d = hasDiff && value != null ? diffOf(value, cmp) : null;
  const tone = d?.dir === 'up' ? U.chipTones.success.fg : d?.dir === 'down' ? U.chipTones.danger.fg : U.ink[500];
  const dirWord = d?.dir === 'up' ? autoT('artış') : d?.dir === 'down' ? autoT('azalış') : d ? autoT('değişmedi') : '';
  const diffLine = hasDiff && value != null ? kpiDiffText(value, cmp, cmpText ?? '', noRecord ?? '') : '';
  const a11y = d ? `${dirWord} · ${diffLine}` : diffLine;
  return (
    <View style={{ ...U.cardSolid, padding: 18, borderRadius: 22, gap: 6, ...style }}>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400] }}>
        {label}
      </Text>
      {value == null ? (
        <Text style={{ fontFamily: DS.font.display as string, fontWeight: '300', fontSize: NUM, letterSpacing: -0.025 * NUM, color: U.ink[400] }}>—</Text>
      ) : (
        <AnimatedNumber
          value={value}
          decimals={decimals}
          style={{ fontFamily: DS.font.display as string, fontWeight: '300', fontSize: NUM, lineHeight: NUM + 6, letterSpacing: -0.025 * NUM, color: U.ink[900], fontVariant: ['tabular-nums'] }}
        />
      )}
      {hasDiff ? (
        <View accessible accessibilityLabel={a11y} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 16 }}>
          {d?.dir === 'up' ? <TrendingUp size={13} color={tone} strokeWidth={2} /> : null}
          {d?.dir === 'down' ? <TrendingDown size={13} color={tone} strokeWidth={2} /> : null}
          <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 12, fontWeight: d ? '600' : '400', color: tone, fontVariant: ['tabular-nums'] }}>
            {diffLine}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: U.ink[500], minHeight: 16 }}>{caption}</Text>
      )}
    </View>
  );
}
