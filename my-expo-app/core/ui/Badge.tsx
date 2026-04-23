import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}

export function Badge({
  label,
  color = '#F1F5F9',
  textColor = '#0F172A',
  size = 'md',
}: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, size === 'sm' && styles.badgeSm]}>
      <Text style={[styles.text, { color: textColor }, size === 'sm' && styles.textSm]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 11,
  },
});
