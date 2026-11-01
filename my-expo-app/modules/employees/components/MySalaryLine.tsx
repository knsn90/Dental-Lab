// modules/employees/components/MySalaryLine.tsx — personelin KENDİ aylık maaşı (teknisyen avans
// ekranı, kurye istatistik ekranı). Kaynak employee_compensation; RLS yalnız kendi satırını verir.
// Yükleniyor / personel eşleşmiyor / maaş yok ya da 0 → hiçbir şey çizilmez ("0" gösterilmez).

import React, { useEffect, useState } from 'react';
import { View, Text, type ViewStyle } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { formatMoney, useBaseCurrency } from '../../../core/money/currency';
import { fetchMyCompensation } from '../compensationApi';

export function MySalaryLine({ style }: { style?: ViewStyle }) {
  const T = useMobileTokens();
  const base = useBaseCurrency();
  const [salary, setSalary] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyCompensation().then(r => { if (alive) setSalary(r?.base_salary ?? null); });
    return () => { alive = false; };
  }, []);

  if (!salary) return null;

  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
    }, style]}>
      <Text style={{ fontSize: 12, color: T.ink2 }}>Aylık maaşın</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: T.ink }}>{formatMoney(Number(salary) || 0, base)}</Text>
    </View>
  );
}
