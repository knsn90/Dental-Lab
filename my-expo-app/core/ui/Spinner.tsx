import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { C } from '../theme/colors';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  color?: string;
}

const sizeMap: Record<SpinnerSize, 'small' | 'large'> = {
  sm: 'small',
  md: 'small',
  lg: 'large',
};

export function Spinner({ size = 'md', color = C.primary }: SpinnerProps) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size={sizeMap[size]} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
