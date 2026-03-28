import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { WorkOrder } from '../types';
import { STATUS_CONFIG, isOrderOverdue } from '../constants';
import { C } from '../../../core/theme/colors';

interface Props {
  orders: WorkOrder[];
  onPress: (order: WorkOrder) => void;
  onStatusAdvance?: (order: WorkOrder) => void;
  showDoctor?: boolean;
}

const COLS = [
  { key: 'order_number', label: 'Sipariş No', width: 110 },
  { key: 'patient', label: 'Hasta', width: 130 },
  { key: 'doctor', label: 'Hekim', width: 140 },
  { key: 'work_type', label: 'İş Türü', width: 140 },
  { key: 'department', label: 'Departman', width: 120 },
  { key: 'status', label: 'Durum', width: 140 },
  { key: 'delivery_date', label: 'Teslim', width: 90 },
  { key: 'tags', label: 'Etiketler', width: 130 },
  { key: 'actions', label: '', width: 80 },
] as const;

export function OrdersTable({ orders, onPress, onStatusAdvance, showDoctor = true }: Props) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header row */}
        <View style={styles.headerRow}>
          {COLS.map((col) =>
            col.key === 'doctor' && !showDoctor ? null : (
              <View key={col.key} style={[styles.headerCell, { width: col.width }]}>
                <Text style={styles.headerText}>{col.label}</Text>
              </View>
            )
          )}
        </View>

        {/* Data rows */}
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sipariş bulunamadı</Text>
          </View>
        ) : (
          orders.map((order, index) => {
            const overdue = isOrderOverdue(order.delivery_date, order.status);
            const cfg = STATUS_CONFIG[order.status];
            const daysLeft = Math.ceil(
              (new Date(order.delivery_date + 'T00:00:00').getTime() - new Date(today).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            const nextStatus = cfg.next;

            return (
              <TouchableOpacity
                key={order.id}
                onPress={() => onPress(order)}
                activeOpacity={0.75}
                style={[
                  styles.row,
                  index % 2 === 0 ? styles.rowEven : styles.rowOdd,
                  overdue && styles.rowOverdue,
                ]}
              >
                {/* Order number */}
                <View style={[styles.cell, { width: COLS[0].width }]}>
                  <Text style={styles.orderNum}>{order.order_number}</Text>
                  {overdue && <Text style={styles.overdueLabel}>GECİKEN</Text>}
                </View>

                {/* Patient */}
                <View style={[styles.cell, { width: COLS[1].width }]}>
                  <Text style={styles.cellText} numberOfLines={1}>
                    {order.patient_name || '—'}
                  </Text>
                  {order.patient_id ? (
                    <Text style={styles.cellSub} numberOfLines={1}>{order.patient_id}</Text>
                  ) : null}
                </View>

                {/* Doctor */}
                {showDoctor && (
                  <View style={[styles.cell, { width: COLS[2].width }]}>
                    <Text style={[styles.cellText, { color: C.primary }]} numberOfLines={1}>
                      {order.doctor?.full_name ?? '—'}
                    </Text>
                    {order.doctor?.clinic?.name ? (
                      <Text style={styles.cellSub} numberOfLines={1}>{order.doctor.clinic.name}</Text>
                    ) : null}
                  </View>
                )}

                {/* Work type */}
                <View style={[styles.cell, { width: COLS[3].width }]}>
                  <Text style={styles.cellText} numberOfLines={1}>{order.work_type}</Text>
                </View>

                {/* Department */}
                <View style={[styles.cell, { width: COLS[4].width }]}>
                  <Text style={styles.cellText} numberOfLines={1}>{order.department || '—'}</Text>
                </View>

                {/* Status */}
                <View style={[styles.cell, { width: COLS[5].width }]}>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bgColor }]}>
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Delivery date */}
                <View style={[styles.cell, { width: COLS[6].width }]}>
                  <Text style={[styles.cellText, overdue && { color: C.danger }]}>
                    {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                  {!overdue && daysLeft <= 2 && order.status !== 'teslim_edildi' && (
                    <Text style={styles.urgentText}>{daysLeft}g kaldı</Text>
                  )}
                </View>

                {/* Tags */}
                <View style={[styles.cell, { width: COLS[7].width, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }]}>
                  {order.tags?.length > 0
                    ? order.tags.slice(0, 2).map((tag) => (
                        <View key={tag} style={styles.tagBadge}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))
                    : null}
                  {(order.tags?.length ?? 0) > 2 && (
                    <Text style={styles.tagMore}>+{order.tags.length - 2}</Text>
                  )}
                </View>

                {/* Actions */}
                {onStatusAdvance && nextStatus && (
                  <View style={[styles.cell, { width: COLS[8].width }]}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        onStatusAdvance(order);
                      }}
                    >
                      <Text style={styles.actionBtnText}>
                        {order.status === 'alindi' ? 'Başlat' : 'İlerlet'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    backgroundColor: C.background,
    borderBottomWidth: 2,
    borderBottomColor: C.border,
    paddingHorizontal: 8,
  },
  headerCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'center',
    minHeight: 52,
  },
  rowEven: { backgroundColor: C.surface },
  rowOdd: { backgroundColor: '#FAFAFA' },
  rowOverdue: { backgroundColor: C.dangerBg },
  cell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  orderNum: { fontSize: 12, fontWeight: '800', color: C.textPrimary },
  overdueLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: C.danger,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cellText: { fontSize: 13, color: C.textPrimary },
  cellSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  urgentText: { fontSize: 11, color: C.warning, fontWeight: '600', marginTop: 2 },
  tagBadge: {
    backgroundColor: C.warningBg,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: 10, color: C.warning, fontWeight: '600' },
  tagMore: { fontSize: 10, color: C.textMuted, alignSelf: 'center' },
  actionBtn: {
    backgroundColor: C.primary,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: C.textMuted },
});
