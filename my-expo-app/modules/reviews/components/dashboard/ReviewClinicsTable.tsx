/**
 * Klinikler tablosu (spec §7.2): en çok düşen en üstte, son 6 ay çizgisi,
 * seçili ayın ortalaması ve önceki 3 aya göre farkı. Satıra dokunmak süzgeci açar/kapar.
 */
import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { MobileTableX, MobileTableRowX, MobileTableInitialX, useMobileTableText } from '../../../../core/ui/MobileTableX';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import { sortClinicRows, avgDelta, formatAvg, shiftMonth, metaSep } from '../../dashboardRules';
import type { ReviewClinicRow } from '../../types';
import { ReviewSparkline } from './ReviewSparkline';
import { useReviewTones, fmtInt, monthShortLabel } from './dashboardUi';

export function ReviewClinicsTable({ rows, month, lang, selectedKey, onSelect }: {
  rows: ReviewClinicRow[];
  /** Seçili ay, 'YYYY-MM-01' */
  month: string;
  lang: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const U = useInkUI();
  const T = useMobileTableText();
  const tones = useReviewTones();
  const panel = usePanelTheme();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 640;
  const sparkW = narrow ? 72 : 96;
  const numW = narrow ? 64 : 86;
  const sorted = sortClinicRows(rows);
  const arrow = isRTL(lang) ? '←' : '→';
  const headEnd = isRTL(lang) ? 'left' as const : 'right' as const;
  const range = `${monthShortLabel(shiftMonth(month, -5), lang)} ${arrow} ${monthShortLabel(month, lang)}`;

  return (
    <MobileTableX title="Klinikler" subtitle="En çok düşen en üstte" count={sorted.length} countLabel="klinik">
      {sorted.length > 0 ? (
        // Dar ekranda uzun çeviriler ("LAST 6 MONTHS") iki satıra iner, kesilmez; satır alta hizalı.
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: U.surfaceSoft, borderBottomWidth: 1, borderBottomColor: U.hairlineSoft }}>
          <Text style={[U.colHeader, { flex: 1 }]}>{autoT('Klinik')}</Text>
          <View style={{ width: sparkW, alignItems: 'flex-end' }}><Text style={[U.colHeader, { textAlign: headEnd }]} numberOfLines={2}>{autoT('Son 6 ay')}</Text></View>
          <View style={{ width: numW, alignItems: 'flex-end' }}><Text style={[U.colHeader, { textAlign: headEnd }]} numberOfLines={2}>{autoT('Bu ay')}</Text></View>
        </View>
      ) : null}

      {sorted.length === 0 ? (
        <MobileTableRowX isLast>
          <Text style={T.sub}>{autoT('Son 6 ayda puan yok')}</Text>
        </MobileTableRowX>
      ) : sorted.map((r, i) => {
        const has = r.month_count > 0;
        const d = has ? avgDelta(r.month_avg, r.prev3_avg) : null;
        const positive = d == null || d === 0 ? null : d > 0;
        const selected = selectedKey === r.key;
        const sub = has
          ? `${fmtInt(r.month_count, lang)} ${autoT('değerlendirme')}${r.month_low > 0 ? `${metaSep(lang)}${fmtInt(r.month_low, lang)} ${autoT('düşük')}` : ''}`
          : autoT('Bu ay puan yok');
        return (
          <MobileTableRowX
            key={r.key}
            isLast={i === sorted.length - 1}
            tint={selected ? (U.isDark ? 'rgba(255,255,255,0.08)' : panel.bg) : undefined}
            onPress={() => onSelect(selected ? null : r.key)}
          >
            <MobileTableInitialX name={r.name} tone={selected ? { bg: panel.primary, fg: onAccentInk(panel.primary) } : undefined} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={T.title} numberOfLines={1}>{r.name ?? '—'}</Text>
              <Text style={T.sub} numberOfLines={1}>{sub}</Text>
            </View>
            <View style={{ width: sparkW, alignItems: 'flex-end' }}>
              <ReviewSparkline series={r.series} positive={positive} width={sparkW} height={28} />
              {!narrow ? <Text style={{ fontSize: 9, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>{range}</Text> : null}
            </View>
            <View style={{ width: numW, alignItems: 'flex-end' }}>
              {has ? (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: U.ink[900], letterSpacing: -0.3 }}>{formatAvg(r.month_avg, lang)}</Text>
                  {d == null ? (
                    <Text style={{ fontSize: 11, color: U.ink[400] }}>{autoT('yeni')}</Text>
                  ) : d === 0 ? (
                    <Text style={{ fontSize: 11, color: U.ink[400] }}>{formatAvg(0, lang)}</Text>
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '600', color: d < 0 ? tones.bad : tones.good }}>
                      {`${d < 0 ? '↓' : '↑'} ${formatAvg(Math.abs(d), lang)}`}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: U.ink[400] }}>—</Text>
                  {r.prev3_avg != null ? (
                    <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{`${formatAvg(r.prev3_avg, lang)} ${autoT('önceki')}`}</Text>
                  ) : null}
                </>
              )}
            </View>
          </MobileTableRowX>
        );
      })}
    </MobileTableX>
  );
}
