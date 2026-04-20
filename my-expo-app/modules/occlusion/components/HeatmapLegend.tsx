// modules/occlusion/components/HeatmapLegend.tsx
// Gradient bar + tick labels — prototipin .legend-bar'ı

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { buildLegendGradient } from '../utils/colorScale';
import type { HeatmapConfig } from '../types/occlusion';

interface Props {
  config: HeatmapConfig;
}

export function HeatmapLegend({ config }: Props) {
  const gradient = useMemo(() => buildLegendGradient(config, 64), [config]);

  // Web: linear-gradient CSS — native: gradient strip via view array
  const gradientCss = useMemo(
    () => `linear-gradient(to right, ${gradient.join(',')})`,
    [gradient],
  );

  return (
    <View style={s.wrap}>
      {Platform.OS === 'web' ? (
        <View style={[s.bar, { backgroundImage: gradientCss } as any]} />
      ) : (
        <View style={[s.bar, s.barNative]}>
          {gradient.map((c, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>
      )}
      <View style={s.ticks}>
        <Text style={s.tick}>-0.5</Text>
        <Text style={s.tick}>0</Text>
        <Text style={s.tick}>0.5</Text>
        <Text style={s.tick}>1.5</Text>
        <Text style={s.tickBold}>{config.maxDistance.toFixed(1)}+</Text>
      </View>
      <View style={s.labels}>
        <Text style={[s.lbl, { color: '#DC2626' }]}>Penetrasyon</Text>
        <Text style={[s.lbl, { color: '#059669' }]}>Temas</Text>
        <Text style={[s.lbl, { color: '#2563EB' }]}>Boşluk</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { marginTop: 4 },
  bar:        {
    height:        12,
    borderRadius:  6,
    borderWidth:   1,
    borderColor:   '#F1F5F9',
    overflow:      'hidden',
  },
  barNative:  { flexDirection: 'row' },
  ticks:      {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      6,
  },
  tick:       { fontSize: 10, color: '#94A3B8', fontVariant: ['tabular-nums'] },
  tickBold:   { fontSize: 10, color: '#0F172A', fontWeight: '700', fontVariant: ['tabular-nums'] },
  labels:     {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      8,
  },
  lbl:        { fontSize: 10, fontWeight: '600' },
});
