import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

interface Props {
  onPress?: () => void;
  active?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  hitSlop?: number;
}

export function IconBtn({ onPress, active, children, style, hitSlop }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      style={[styles.btn, active && styles.btnActive, style]}
    >
      {children}
    </TouchableOpacity>
  );
}

export const styles = StyleSheet.create({
  btn: {
    width: 42, height: 42,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: '#E2E8F0',
  },
});
