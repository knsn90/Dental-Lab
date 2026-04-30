// SLAAlert — single inline line, red glow when late, no box.
import React from 'react';
import { Text, StyleSheet, Platform } from 'react-native';

import { STAGE_LABEL, type Stage } from '../../stages';
import type { SlaStatus } from '../../slaConfig';

interface Props {
  stage:     Stage | null;
  delayTime: string;     // pre-formatted humanIdle()
  status:    SlaStatus;  // 'red' | 'yellow' | 'green' | 'none'
}

export function SLAAlert({ stage, delayTime, status }: Props) {
  if (!stage || (status !== 'red' && status !== 'yellow')) return null;
  const isRed = status === 'red';
  return (
    <Text style={[s.alert, isRed ? s.red : s.yellow]}>
      {isRed
        ? `🔴 ${STAGE_LABEL[stage]} gecikti (+${delayTime})`
        : `🟡 ${STAGE_LABEL[stage]} SLA'e yaklaşıyor (${delayTime})`}
    </Text>
  );
}

const s = StyleSheet.create({
  alert: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  red: {
    color: '#FCA5A5',
    ...Platform.select({
      web: { textShadow: '0 0 12px rgba(220,38,38,0.45)' } as any,
      default: {},
    }),
  },
  yellow: {
    color: '#FCD34D',
    ...Platform.select({
      web: { textShadow: '0 0 10px rgba(217,119,6,0.35)' } as any,
      default: {},
    }),
  },
});
