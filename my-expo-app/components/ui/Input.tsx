import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import Colors from '../../constants/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
}

export function Input({ label, error, hint, rightIcon, onRightIconPress, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E8EDF4',
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  focused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
    // @ts-ignore
    boxShadow: '0 0 0 3px rgba(37,99,235,0.10)',
  },
  errored: { borderColor: Colors.error },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  rightIcon: { paddingLeft: 8 },
  error: { fontSize: 12, color: Colors.error, marginTop: 4 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
});
