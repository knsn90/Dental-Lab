/**
 * StatementVatSummary — ekstre sonunda faturaların KDV dökümü.
 *
 * Kullanıcı: "müşterilerin bazısı faturalara tek tek bakmadığı için KDV'nin fiyatın
 * içinde olduğunu anlamıyor. KDV'ler ayrı yazılsın ve sonda toplansın total fiyata."
 * Ara Toplam (KDV hariç) + KDV Toplamı = Genel Toplam (KDV dahil). Değerler
 * lib/statementVat.statementVatSummary'den gelir (yalnız fatura satırları).
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';

export function StatementVatSummary({ summary, fmt, padH = 16 }: {
  summary: { net: number; tax: number; total: number };
  fmt: (n: number) => string;
  /** Satır yatay dolgusu — tablonun kendi dolgusuyla hizalanır (mobil 16, masaüstü 20) */
  padH?: number;
}) {
  const U = useInkUI();
  const row = (label: string, value: string, strong?: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, fontSize: strong ? 13 : 12, fontWeight: strong ? '700' : '500', color: strong ? U.ink[900] : U.ink[500] }}>
        {label}
      </Text>
      <Text style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? '700' : '600', color: strong ? U.ink[900] : U.ink[700] }}>
        {value}
      </Text>
    </View>
  );
  return (
    <View style={{
      paddingHorizontal: padH, paddingVertical: 12, gap: 6,
      borderTopWidth: 1, borderTopColor: U.hairline,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: U.ink[400] }}>
        Faturaların KDV dökümü
      </Text>
      {row('Ara Toplam (KDV hariç)', fmt(summary.net))}
      {row('KDV Toplamı', fmt(summary.tax))}
      <View style={{ height: 1, backgroundColor: U.hairlineSoft, marginVertical: 2 }} />
      {row('Genel Toplam (KDV dahil)', fmt(summary.total), true)}
    </View>
  );
}
