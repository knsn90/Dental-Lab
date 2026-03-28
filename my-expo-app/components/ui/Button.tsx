import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Colors from '../../constants/colors';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
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
          color={variant === 'primary' || variant === 'danger' ? Colors.white : Colors.primary}
        />
      ) : (
        <Text style={[styles.label, labelStyles[variant], labelSizes[size]]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Variants
  primary: {
    backgroundColor: Colors.primary,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(37,99,235,0.28)',
  },
  secondary: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  danger: {
    backgroundColor: Colors.error,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(220,38,38,0.22)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  // Sizes
  sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  md: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
  lg: { paddingVertical: 16, paddingHorizontal: 24, minHeight: 52 },
  // Modifiers
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
});

const labelStyles: Record<Variant, TextStyle> = StyleSheet.create({
  primary: { color: Colors.white },
  secondary: { color: Colors.primary },
  outline: { color: Colors.primary },
  danger: { color: Colors.white },
  ghost: { color: Colors.primary },
});

const labelSizes: Record<Size, TextStyle> = StyleSheet.create({
  sm: { fontSize: 13, fontWeight: '600' },
  md: { fontSize: 15, fontWeight: '600' },
  lg: { fontSize: 16, fontWeight: '700' },
});
