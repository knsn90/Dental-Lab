// İş İstatistikleri ekran durumu — seçili ay, kıyas, klinik/çip/odak süzgeçleri, sekme.
// Ay sınırları: [kayıt döneminin ilk ayı, bugünün ayı]. İlk ay veri gelince bilinir
// (`setFirstMonth`); o zamana dek yalnız üst sınır uygulanır.
import { useCallback, useEffect, useState } from 'react';
import { monthKeyOf, type MonthKey, type CompareMode } from './months';
import type { HeatAxis } from './aggregate';

export type WorkStatsTab = 'overview' | 'heat';

/** Bilinmiyor (veri gelmedi) = undefined; lab'ın hiç siparişi yok = null. */
export type FirstMonthBound = MonthKey | null | undefined;

export function clampMonth(k: MonthKey, firstMonth: FirstMonthBound, today: MonthKey): MonthKey {
  let v = k > today ? today : k;
  if (firstMonth === null) v = today;
  else if (firstMonth !== undefined && v < firstMonth) v = firstMonth > today ? today : firstMonth;
  return v;
}

export function useWorkStatsState() {
  const today = monthKeyOf(new Date());
  const [selected, setSelectedRaw] = useState<MonthKey>(today);
  const [firstMonth, setFirstMonth] = useState<FirstMonthBound>(undefined);
  const [compare, setCompare] = useState<CompareMode>('prev');
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [chipWorkType, setChipWorkType] = useState<string | null>(null);
  const [focusWorkType, setFocusWorkType] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkStatsTab>('overview');
  const [heatAxis, setHeatAxis] = useState<HeatAxis>('workType');

  const setSelected = useCallback((k: MonthKey) => {
    setSelectedRaw(clampMonth(k, firstMonth, monthKeyOf(new Date())));
  }, [firstMonth]);

  // İlk ay öğrenilince mevcut seçim aralık dışındaysa içeri çek.
  useEffect(() => {
    setSelectedRaw((s) => clampMonth(s, firstMonth, monthKeyOf(new Date())));
  }, [firstMonth]);

  return {
    selected, setSelected,
    today,
    firstMonth, setFirstMonth,
    compare, setCompare,
    clinicId, setClinicId,
    chipWorkType, setChipWorkType,
    focusWorkType, setFocusWorkType,
    tab, setTab,
    heatAxis, setHeatAxis,
  };
}

export type WorkStatsState = ReturnType<typeof useWorkStatsState>;
