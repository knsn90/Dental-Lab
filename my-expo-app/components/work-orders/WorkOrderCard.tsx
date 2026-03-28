import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WorkOrder } from '../../lib/types';
import { isOverdue, formatDeliveryDate } from '../../constants/status';
import { StatusBadge } from './StatusBadge';
import Colors from '../../constants/colors';

interface WorkOrderCardProps {
  order: WorkOrder;
  onPress: () => void;
  showDoctor?: boolean;
}

export function WorkOrderCard({ order, onPress, showDoctor = false }: WorkOrderCardProps) {
  const overdue = isOverdue(order.delivery_date, order.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.card, overdue && styles.overdueCard]}
    >
      <View style={styles.header}>
        <Text style={styles.orderNumber}>{order.order_number}</Text>
        <StatusBadge status={order.status} size="sm" />
      </View>

      {showDoctor && order.doctor && (
        <Text style={styles.doctorName}>
          Dr. {order.doctor.full_name}
          {order.doctor.clinic?.name ? ` · ${order.doctor.clinic.name}` : ''}
        </Text>
      )}

      <Text style={styles.workType}>{order.work_type}</Text>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Diş No</Text>
          <Text style={styles.footerValue}>{order.tooth_numbers.join(', ')}</Text>
        </View>
        {order.shade && (
          <View style={styles.footerItem}>
            <Text style={styles.footerLabel}>Renk</Text>
            <Text style={styles.footerValue}>{order.shade}</Text>
          </View>
        )}
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Makine</Text>
          <Text style={styles.footerValue}>
            {order.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'}
          </Text>
        </View>
        <View style={[styles.footerItem, styles.dateItem]}>
          <Text style={styles.footerLabel}>Teslim</Text>
          <Text style={[styles.footerValue, overdue && styles.overdueText]}>
            {overdue ? '⚠️ ' : ''}{formatDeliveryDate(order.delivery_date)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    // @ts-ignore — boxShadow is valid on web via react-native-web
    boxShadow: '0px 1px 3px rgba(0,0,0,0.05)',
    elevation: 1,
  },
  overdueCard: {
    borderColor: Colors.overdueBorder,
    backgroundColor: Colors.overdueBg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  doctorName: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  workType: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  footerItem: {
    minWidth: 80,
  },
  dateItem: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  footerLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  overdueText: {
    color: Colors.overdueText,
  },
});
