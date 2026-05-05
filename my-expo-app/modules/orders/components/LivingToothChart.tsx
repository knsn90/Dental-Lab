// modules/orders/components/LivingToothChart.tsx
// "Living" diş şeması — sadece statik picker değil, her seçili dişin altında
// mini status chip (renk/iş tipi/foto). Kart başlığı + alt legend ile birlikte.
//
// İçeride mevcut ToothNumberPicker'ı kullanır; bilgi katmanını üstte/altında ekler.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ToothNumberPicker } from './ToothNumberPicker';
import { AppIcon } from '../../../core/ui/AppIcon';
import type { WorkOrder } from '../types';

interface LivingToothChartProps {
  order:         WorkOrder;
  containerWidth: number;        // tooth picker'ın iç genişliği
  containerHeight?: number;      // opsiyonel: aspect kilidini kır
  fit?:          'meet' | 'slice' | 'none';
  frameless?:    boolean;        // dış kart kabuğunu kaldır (parent zaten kart ise)
  accentColor?:  string;
  activeTooth?:  number | null;
  onToothPress?: (fdi: number) => void;
  /** Hangi çene gösterilsin? — undefined = auto (hideEmptyJaw heuristic) */
  forceJawMode?: 'upper' | 'lower' | 'both';
  /** Per-tooth fill color override — örn: işlem grubuna göre farklı renkler */
  colorMap?: Record<number, string>;
}

export function LivingToothChart({
  order,
  containerWidth,
  containerHeight,
  fit,
  frameless     = false,
  accentColor   = '#2563EB',
  activeTooth,
  onToothPress,
  forceJawMode,
  colorMap,
}: LivingToothChartProps) {
  const sorted = useMemo(
    () => [...(order.tooth_numbers ?? [])].sort((a, b) => a - b),
    [order.tooth_numbers],
  );
  const photos = (order.photos ?? []) as Array<{ tooth_number?: number }>;

  // Foto'su olan dişlerin sayısı (özet için)
  const teethWithPhotos = useMemo(() => {
    const set = new Set<number>();
    photos.forEach(p => { if (p.tooth_number != null) set.add(p.tooth_number); });
    return set;
  }, [photos]);

  return (
    <View style={frameless ? undefined : s.card}>

      {/* Title kaldırıldı — picker doğrudan görünür */}

      {/* ── Picker ── */}
      <View style={frameless ? { alignItems: 'center', justifyContent: 'center' } : s.pickerWrap}>
        <ToothNumberPicker
          selected={order.tooth_numbers ?? []}
          onChange={() => {}}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          fit={fit}
          hideEmptyJaw={!forceJawMode}
          forceJawMode={forceJawMode}
          accentColor={accentColor}
          colorMap={colorMap}
          activeTooth={activeTooth}
          onToothPress={onToothPress}
        />
      </View>

      {/* Alt özet çubuğu kaldırıldı — kart sadece picker'dan ibaret */}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     '#EEF1F6',
    overflow:        'hidden',
    shadowColor:     '#0F172A',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.06,
    shadowRadius:    14,
    elevation:       3,
  },

  // Header
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconWrap: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle:   { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.1 },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      8,
    borderWidth:       1,
  },
  countText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Picker container — 4 yönden eşit padding (üst = alt = sol = sağ = 16)
  pickerWrap: {
    padding:        16,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Compact summary row (alt — tek satır)
  summaryRow: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    gap:              12,
    paddingHorizontal: 14,
    paddingVertical:  8,
    borderTopWidth:   1,
    borderTopColor:   '#F1F5F9',
    backgroundColor:  '#FAFBFC',
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryDot:  { width: 7, height: 7, borderRadius: 3.5 },
  shadeDot:    { width: 7, height: 7, borderRadius: 3.5 },
  summaryText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
});

export default LivingToothChart;
