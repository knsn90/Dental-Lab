import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { WorkOrder, WorkOrderStatus } from '../types';
import { STATUS_CONFIG, isOrderOverdue, getNextStatus } from '../constants';
import { C } from '../../../core/theme/colors';

interface Props {
  orders: WorkOrder[];
  userGroup: '(lab)' | '(doctor)';
  onStatusAdvance?: (order: WorkOrder) => void;
}

const COLUMNS: WorkOrderStatus[] = [
  'alindi',
  'uretimde',
  'kalite_kontrol',
  'teslimata_hazir',
  'teslim_edildi',
];

export function KanbanBoard({ orders, userGroup, onStatusAdvance }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const byStatus = COLUMNS.reduce<Record<WorkOrderStatus, WorkOrder[]>>(
    (acc, s) => {
      acc[s] = orders.filter((o) => o.status === s);
      return acc;
    },
    {} as Record<WorkOrderStatus, WorkOrder[]>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}
    >
      {COLUMNS.map((status) => {
        const cfg = STATUS_CONFIG[status];
        const col = byStatus[status];
        return (
          <View key={status} style={styles.column}>
            {/* Column header */}
            <View style={[styles.colHeader, { borderTopColor: cfg.color }]}>
              <View style={styles.colHeaderLeft}>
                <View style={[styles.colDot, { backgroundColor: cfg.color }]} />
                <Text style={styles.colTitle}>{cfg.label}</Text>
              </View>
              <View style={[styles.colCount, { backgroundColor: cfg.bgColor }]}>
                <Text style={[styles.colCountText, { color: cfg.color }]}>{col.length}</Text>
              </View>
            </View>

            {/* Cards */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.colCards}
            >
              {col.length === 0 ? (
                <View style={styles.emptyCol}>
                  <Text style={styles.emptyColText}>Sipariş yok</Text>
                </View>
              ) : (
                col.map((order) => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    today={today}
                    userGroup={userGroup}
                    onPress={() => router.push(`/${userGroup}/order/${order.id}` as any)}
                    onAdvance={onStatusAdvance ? () => onStatusAdvance(order) : undefined}
                  />
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

function KanbanCard({
  order,
  today,
  userGroup,
  onPress,
  onAdvance,
}: {
  order: WorkOrder;
  today: string;
  userGroup: string;
  onPress: () => void;
  onAdvance?: () => void;
}) {
  const overdue = isOrderOverdue(order.delivery_date, order.status);
  const nextStatus = getNextStatus(order.status);
  const daysLeft = Math.ceil(
    (new Date(order.delivery_date + 'T00:00:00').getTime() - new Date(today).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const createdDate = new Date(order.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, overdue && styles.cardOverdue]}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={styles.cardTop}>
        <Text style={styles.cardNum}>{order.order_number}</Text>
        {overdue ? (
          <View style={styles.overdueBadge}>
            <Text style={styles.overdueBadgeText}>GECİKEN</Text>
          </View>
        ) : daysLeft <= 2 && order.status !== 'teslim_edildi' ? (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentBadgeText}>{daysLeft}g kaldı</Text>
          </View>
        ) : null}
      </View>

      {/* Doctor */}
      {order.doctor && (
        <Text style={styles.cardDoctor}>{order.doctor.full_name}</Text>
      )}

      {/* Work type */}
      <Text style={styles.cardWorkType}>{order.work_type}</Text>

      {/* Meta row */}
      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaItem}>
          🦷 {order.tooth_numbers.slice(0, 4).join(', ')}
          {order.tooth_numbers.length > 4 ? '…' : ''}
        </Text>
        <Text style={[styles.cardMetaItem, overdue && { color: C.danger }]}>
          📅 {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
        </Text>
      </View>

      <View style={styles.cardMetaRow2}>
        <Text style={styles.cardMetaItem}>Oluşturuldu: {createdDate}</Text>
        {order.shade ? <Text style={styles.cardMetaItem}>🎨 {order.shade}</Text> : null}
      </View>

      {/* Actions — only for lab users */}
      {userGroup === '(lab)' && nextStatus && onAdvance && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.btnFinish}
            onPress={(e) => {
              e.stopPropagation?.();
              onAdvance();
            }}
          >
            <Text style={styles.btnFinishText}>
              {order.status === 'alindi' ? 'Başlat' : 'Tamamla'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const COL_WIDTH = 240;

const styles = StyleSheet.create({
  board: {
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  column: {
    width: COL_WIDTH,
    maxHeight: '100%',
    flexShrink: 0,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderTopWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    // @ts-ignore
    boxShadow: '0px 1px 3px rgba(0,0,0,0.06)',
  },
  colHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  colCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  colCountText: { fontSize: 12, fontWeight: '800' },
  colCards: { gap: 8, paddingBottom: 16 },
  emptyCol: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  emptyColText: { fontSize: 13, color: C.textMuted },

  card: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    // @ts-ignore
    boxShadow: '0px 1px 4px rgba(0,0,0,0.06)',
  },
  cardOverdue: {
    borderColor: '#FCA5A5',
    backgroundColor: C.dangerBg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardNum: { fontSize: 13, fontWeight: '800', color: C.textPrimary },
  overdueBadge: {
    backgroundColor: C.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overdueBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  urgentBadge: {
    backgroundColor: C.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urgentBadgeText: { fontSize: 10, fontWeight: '700', color: C.warning },
  cardDoctor: { fontSize: 13, fontWeight: '600', color: C.primary, marginBottom: 2 },
  cardWorkType: { fontSize: 12, color: C.textSecondary, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  cardMetaRow2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardMetaItem: { fontSize: 11, color: C.textMuted },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  btnFinish: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
  },
  btnFinishText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
