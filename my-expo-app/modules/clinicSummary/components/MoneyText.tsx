// Çok dövizli tutar: en büyük döviz + "+N" rozeti; tüm dövizler GlassTooltip'te.
// Dövizler asla toplanmaz.
import React from 'react';
import { View, Text } from 'react-native';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useInkUI } from '../../../core/theme/inkScale';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { autoT } from '../../../core/i18n/autoTranslate';
import { pickMain, type Money } from '../summary';

export const fmtMoney = (m: Money) => formatMoney(Number(m.amount) || 0, m.currency as Currency, { fractionDigits: 0 });

export function MoneyText({ list, color, size = 12.5, weight = '600' }: {
  list: Money[]; color?: string; size?: number; weight?: '500' | '600' | '700';
}) {
  const U = useInkUI();
  const { main, rest } = pickMain(list);
  if (!main) return <Text style={{ fontSize: size, fontWeight: weight, color: color ?? U.ink[900] }}>—</Text>;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: size, fontWeight: weight, color: color ?? U.ink[900] }}>{fmtMoney(main)}</Text>
      {rest > 0 ? (
        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipTones.neutral.bg }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.neutral.fg }}>{`+${rest}`}</Text>
        </View>
      ) : null}
    </View>
  );
  if (rest === 0) return body;
  return (
    <GlassTooltip title={autoT('Dövizler')} text={list.map(fmtMoney).join(' · ')}>
      {body}
    </GlassTooltip>
  );
}
