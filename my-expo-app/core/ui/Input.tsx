import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  disabled?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
}

export function Input({
  label,
  error,
  disabled,
  leftIcon,
  rightIcon,
  onRightIconPress,
  style,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.focused,
          !!error && styles.errored,
          disabled && styles.disabledWrapper,
        ]}
      >
        {leftIcon && <Text style={styles.leftIcon}>{leftIcon}</Text>}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={C.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          {...props}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon} disabled={!onRightIconPress}>
            <Text>{rightIcon}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceAlt,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: S.inputRadius,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  focused: {
    borderColor: C.borderFocus,
    backgroundColor: C.surface,
    // @ts-ignore
    boxShadow: '0 0 0 3px rgba(37,99,235,0.10)',
  },
  errored: { borderColor: C.danger },
  disabledWrapper: { opacity: 0.5 },
  leftIcon: { marginRight: 8, fontSize: 16 },
  input: {
    flex: 1,
    fontSize: 15,
    color: C.textPrimary,
    paddingVertical: 12,
  },
  rightIcon: { paddingLeft: 8 },
  error: { fontSize: 12, color: C.danger, marginTop: 4 },
});
