import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';
import { Shadows } from '../theme/shadows';

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  radius?: number;
  shadow?: 'none' | 'sm' | 'md';
  style?: ViewStyle;
}

export function Card({
  children,
  padding = S.cardPad,
  radius = S.cardRadius,
  shadow = 'sm',
  style,
}: CardProps) {
  const shadowStyle = shadow === 'none' ? {} : Shadows[shadow];

  return (
    <View
      style={[
        styles.card,
        { padding, borderRadius: radius },
        shadowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
});
