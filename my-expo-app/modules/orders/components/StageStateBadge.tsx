// modules/orders/components/StageStateBadge.tsx
// Stage status için renkli pill — kuyruk kartında, hero'da, workstation header'ında.

import React from 'react';
import { View, Text } from 'react-native';
import { getStageStateMeta, type StageStatus } from '../stations/stageStates';
import { hexA } from '../../../core/theme/stationPalette';

export function StageStateBadge({
  status, size = 'md', filled = false,
}: {
  status: StageStatus | string;
  size?: 'sm' | 'md' | 'lg';
  /** filled: solid bg with accent (hero), false: tinted bg (queue) */
  filled?: boolean;
}) {
  const meta = getStageStateMeta(status);
  const Icon = meta.icon;

  const dims = {
    sm: { px: 6,  py: 2,   gap: 4,  fs: 9.5, iconSize: 9 },
    md: { px: 9,  py: 3,   gap: 5,  fs: 11,  iconSize: 11 },
    lg: { px: 12, py: 4.5, gap: 7,  fs: 12,  iconSize: 13 },
  }[size];

  const bg = filled ? meta.color : meta.bgTint;
  const fg = filled ? '#FFFFFF' : meta.color;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: dims.gap,
      paddingHorizontal: dims.px, paddingVertical: dims.py, borderRadius: 999,
      backgroundColor: bg,
      borderWidth: filled ? 0 : 1,
      borderColor: hexA(meta.color, 0.20),
    }}>
      {status === 'aktif' ? (
        <View style={{
          width: dims.iconSize - 3, height: dims.iconSize - 3, borderRadius: 999,
          backgroundColor: fg,
        }} />
      ) : (
        <Icon size={dims.iconSize} color={fg} strokeWidth={2} />
      )}
      <Text style={{
        fontSize: dims.fs, fontWeight: '700', color: fg,
        letterSpacing: 0.6, textTransform: 'uppercase',
      }}>
        {meta.short}
      </Text>
    </View>
  );
}
