import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useMobileTokens } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';

interface Props {
  onPress?: () => void;
  active?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  hitSlop?: number;
}

export function IconBtn({ onPress, active, children, style, hitSlop }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      style={[
        styles.btn,
        { backgroundColor: isDark ? T.cardSoft : '#F1F5F9' },
        active && { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0' },
        style,
      ]}
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
