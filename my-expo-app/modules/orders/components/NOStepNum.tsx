/**
 * NOStepNum — 26×26 numbered step badge
 * ───────────────────────────────────────
 * 3 states: done (black bg, saffron check), current (saffron bg, black number), todo (outline)
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { NO, NORadius } from './NOTokens';

export type NOStepState = 'done' | 'current' | 'todo';

export interface NOStepNumProps {
  n: number;
  state: NOStepState;
}

export function NOStepNum({ n, state }: NOStepNumProps) {
  const isDone = state === 'done';
  const isCurrent = state === 'current';

  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13, // circle
        backgroundColor: isDone
          ? NO.inkStrong
          : isCurrent
          ? NO.saffron
          : 'transparent',
        borderWidth: state === 'todo' ? 1.5 : 0,
        borderColor: state === 'todo' ? 'rgba(0,0,0,0.15)' : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isDone ? (
        <Check size={12} color={NO.saffron} strokeWidth={2.5} />
      ) : (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: isCurrent ? NO.inkStrong : NO.inkMute,
          }}
        >
          {n}
        </Text>
      )}
    </View>
  );
}
