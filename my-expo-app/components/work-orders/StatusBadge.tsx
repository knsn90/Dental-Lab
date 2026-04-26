import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { WorkOrderStatus } from '../../lib/types';
import { STATUS_CONFIG } from '../../constants/status';

interface StatusBadgeProps {
  status: WorkOrderStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bgColor },
        size === 'sm' && styles.badgeSm,
      ]}
    >
      <View style={styles.inner}>
        <Feather name={config.ionIcon as any} size={size === 'sm' ? 11 : 13} color={config.color} />
        <Text style={[styles.label, { color: config.color }, size === 'sm' && styles.labelSm]}>
          {config.label}
        </Text>
      </View>
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
  inner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelSm: {
    fontSize: 11,
  },
});
