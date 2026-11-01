// Karlılık kırılım tablolarının ortak parçaları: döviz dilimli tutar sütunu + pay yüzdesi.
import React from 'react';
import { View, Text } from 'react-native';

import { formatMoney, type Currency } from '../../../core/money/currency';
import { useMobileTableText } from '../../../core/ui/MobileTableX';
import type { Slice } from '../profitBreakdown';

export const fmtPct = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Sağ sütun: her döviz ayrı satır (hero'daki Gelir kutucuğu gibi) + altında pay. */
export function SliceAmount({ slices, share }: { slices: Slice[]; share: number }) {
  const TT = useMobileTableText();
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {slices.length === 0 ? (
        <Text style={TT.amount}>—</Text>
      ) : slices.map(s => (
        <Text key={s.currency} style={TT.amount} numberOfLines={1}>
          {formatMoney(Number(s.total) || 0, s.currency as Currency, { fractionDigits: 0 })}
        </Text>
      ))}
      <Text style={TT.amountSub}>%{fmtPct(share)}</Text>
    </View>
  );
}
