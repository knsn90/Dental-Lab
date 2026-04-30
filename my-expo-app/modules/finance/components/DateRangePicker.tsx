/**
 * DateRangePicker — Mali İşlemler ortak tarih aralığı seçici
 *
 * 5 hazır preset (Bu Ay, Geçen Ay, Bu Yıl, Son 12 Ay, Tümü)
 * Cards Design System uyumlu pill chip'ler.
 *
 * Kullanım:
 *   const [range, setRange] = useState<RangeKey>('this_month');
 *   <DateRangePicker value={range} onChange={setRange} />
 *   const { from, to } = getRangeBounds(range);
 */
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View, ViewStyle } from 'react-native';

export type RangeKey = 'this_month' | 'last_month' | 'this_year' | 'last_12_months' | 'all';

export interface RangeOption {
  key: RangeKey;
  label: string;
}

export const RANGE_OPTIONS: RangeOption[] = [
  { key: 'this_month',    label: 'Bu Ay'      },
  { key: 'last_month',    label: 'Geçen Ay'   },
  { key: 'this_year',     label: 'Bu Yıl'     },
  { key: 'last_12_months',label: 'Son 12 Ay'  },
  { key: 'all',           label: 'Tümü'       },
];

/** ISO YYYY-MM-DD aralığını döndürür. `all` için null/null. */
export function getRangeBounds(key: RangeKey): { from: string | null; to: string | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (key) {
    case 'this_month': {
      const from = new Date(y, m, 1);
      const to   = new Date(y, m + 1, 0);
      return { from: iso(from), to: iso(to) };
    }
    case 'last_month': {
      const from = new Date(y, m - 1, 1);
      const to   = new Date(y, m, 0);
      return { from: iso(from), to: iso(to) };
    }
    case 'this_year': {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'last_12_months': {
      const from = new Date(y, m - 11, 1);
      return { from: iso(from), to: iso(now) };
    }
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export interface DateRangePickerProps {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  accent?: string;
  style?: ViewStyle;
  /** Hangi presetler gösterilsin (varsayılan: hepsi) */
  options?: RangeOption[];
}

export function DateRangePicker({
  value, onChange,
  accent = '#0F172A',
  style,
  options = RANGE_OPTIONS,
}: DateRangePickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.row, style]}
    >
      {options.map(opt => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[s.chip, active && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.85}
          >
            <Text style={[s.chipText, active && { color: '#FFFFFF' }]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
});
