import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: string;
  style?: ViewStyle;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : C.primary}
        />
      ) : (
        <View style={styles.inner}>
          {icon && <Text style={[styles.icon, labelSizes[size]]}>{icon}</Text>}
          <Text style={[styles.label, labelStyles[variant], labelSizes[size]]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: S.btnRadius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Variants
  primary: {
    backgroundColor: C.primary,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(37,99,235,0.28)',
  },
  secondary: {
    backgroundColor: C.primaryBg,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: C.danger,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(220,38,38,0.22)',
  },
  // Sizes
  sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  md: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
  lg: { paddingVertical: 16, paddingHorizontal: 24, minHeight: 52 },
  // Modifiers
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  label: {},
  icon: {},
});

const labelStyles: Record<Variant, TextStyle> = StyleSheet.create({
  primary: { color: '#FFFFFF' },
  secondary: { color: C.primary },
  ghost: { color: C.primary },
  danger: { color: '#FFFFFF' },
});

const labelSizes: Record<Size, TextStyle> = StyleSheet.create({
  sm: { fontSize: 13, fontWeight: '600' },
  md: { fontSize: 15, fontWeight: '600' },
  lg: { fontSize: 16, fontWeight: '700' },
});
