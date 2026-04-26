import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { StatusHistory } from '../../../lib/types';
import { STATUS_CONFIG } from '../constants';
import { C } from '../../../core/theme/colors';

interface StatusTimelineProps {
  history: StatusHistory[];
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StatusTimeline({ history }: StatusTimelineProps) {
  if (history.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Henüz durum değişikliği yok.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {history.map((item, index) => {
        const config = STATUS_CONFIG[item.new_status];
        const isLast = index === history.length - 1;

        return (
          <View key={item.id} style={styles.row}>
            {/* Timeline line */}
            <View style={styles.lineContainer}>
              <View style={[styles.dot, { backgroundColor: config.color }]} />
              {!isLast && <View style={styles.line} />}
            </View>

            {/* Content */}
            <View style={[styles.content, !isLast && styles.contentMargin]}>
              <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
                <View style={styles.badgeInner}>
                  <Feather name={config.ionIcon as any} size={12} color={config.color} />
                  <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
                </View>
              </View>
              <Text style={styles.timestamp}>{formatDateTime(item.created_at)}</Text>
              {item.changer && (
                <Text style={styles.changer}>{item.changer.full_name}</Text>
              )}
              {item.note && <Text style={styles.note}>{item.note}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  empty: { paddingVertical: 16 },
  emptyText: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
  row: { flexDirection: 'row' },
  lineContainer: { alignItems: 'center', width: 24, marginRight: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: C.border,
    marginTop: 4,
  },
  content: { flex: 1, paddingBottom: 4 },
  contentMargin: { paddingBottom: 20 },
  badge: {
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  timestamp: { fontSize: 12, color: C.textMuted, marginBottom: 2 },
  changer: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  note: {
    fontSize: 13,
    color: C.textPrimary,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
