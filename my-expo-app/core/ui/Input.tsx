import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

import { AppIcon } from './AppIcon';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;            // Yardım metni (hata yokken görünür)
  required?: boolean;       // Kırmızı * işareti ekler
  success?: boolean;        // Yeşil border + tik
  disabled?: boolean;
  leftIcon?: string;        // MaterialCommunityIcons icon name
  rightIcon?: string;       // MaterialCommunityIcons icon name
  onRightIconPress?: () => void;
}

export function Input({
  label,
  error,
  hint,
  required,
  success,
  disabled,
  leftIcon,
  rightIcon,
  onRightIconPress,
  style,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);

  // Error shake animation
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const errorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (error) {
      // Shake
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start();
      // Fade in error
      Animated.timing(errorOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(errorOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
  }, [error]);

  const borderColor = error   ? C.danger
                    : success ? C.success
                    : focused ? C.borderFocus
                    : C.border;

  const bgColor = error   ? C.dangerBg
                : success ? C.successBg
                : focused ? C.surface
                : C.surfaceAlt;

  return (
    <View style={styles.container}>
      {/* Label */}
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {required && <Text style={styles.required}> *</Text>}
        </View>
      )}

      {/* Input wrapper */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <View
          style={[
            styles.inputWrapper,
            { borderColor, backgroundColor: bgColor },
            focused && styles.focusShadow,
            disabled && styles.disabledWrapper,
          ]}
        >
          {/* Left icon */}
          {leftIcon && (
            <AppIcon
              name={leftIcon as any}
              size={18}
              color={error ? C.danger : focused ? C.primary : C.textMuted}
              style={styles.leftIcon}
            />
          )}

          <TextInput
            style={[styles.input, style]}
            placeholderTextColor={C.textMuted}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!disabled}
            {...props}
          />

          {/* Success tick */}
          {success && !error && (
            <AppIcon name="check-circle" size={18} color={C.success} style={styles.rightIcon} />
          )}

          {/* Right icon (custom) */}
          {rightIcon && !success && (
            <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon} disabled={!onRightIconPress}>
              <AppIcon
                name={rightIcon as any}
                size={18}
                color={C.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Error message — animated */}
      {error ? (
        <Animated.View style={{ opacity: errorOpacity }}>
          <View style={styles.errorRow}>
            <AppIcon name="alert-circle-outline" size={13} color={C.danger} />
            <Text style={styles.error}> {error}</Text>
          </View>
        </Animated.View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textPrimary,
  },
  required: {
    fontSize: 14,
    fontWeight: '700',
    color: C.danger,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: S.inputRadius,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  focusShadow: {
    // @ts-ignore
    boxShadow: '0 0 0 3px rgba(37,99,235,0.10)',
  },
  disabledWrapper: { opacity: 0.5 },
  leftIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    color: C.textPrimary,
    paddingVertical: 12,
  },
  rightIcon: { paddingLeft: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  error: { fontSize: 12, color: C.danger, fontWeight: '500' },
  hint:  { fontSize: 12, color: C.textMuted, marginTop: 5 },
});
