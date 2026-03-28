import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../theme/colors';

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ emoji, title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && (
        <TouchableOpacity style={styles.actionBtn} onPress={action.onPress}>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emoji: { fontSize: 48 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textSecondary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  actionBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
