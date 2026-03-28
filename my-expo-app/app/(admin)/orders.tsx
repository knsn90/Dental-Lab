import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import Colors from '../../constants/colors';
import { STATUS_CONFIG } from '../../constants/status';
import { WorkOrder, WorkOrderStatus } from '../../lib/types';
import { OrdersTable } from '../../components/work-orders/OrdersTable';

const ALL_STATUSES: WorkOrderStatus[] = [
  'alindi',
  'uretimde',
  'kalite_kontrol',
  'teslimata_hazir',
  'teslim_edildi',
];

type ExtendedOrder = WorkOrder & { doctor_name: string };

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const [orders, setOrders] = useState<ExtendedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('work_orders')
      .select('*, doctor:doctor_id(full_name, clinic_name)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(
        data.map((o: any) => ({
          ...o,
          doctor_name: o.doctor?.full_name ?? '—',
        }))
      );
    }
    setLoading(false);
  };

  const today = new Date().toISOString().split('T')[0];

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (showOverdueOnly && (o.delivery_date >= today || o.status === 'teslim_edildi')) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !o.order_number.toLowerCase().includes(q) &&
        !o.doctor_name.toLowerCase().includes(q) &&
        !o.work_type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const overdueCount = orders.filter(
    (o) => o.delivery_date < today && o.status !== 'teslim_edildi'
  ).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tüm Siparişler</Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Sipariş no, hekim, iş tipi..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Overdue toggle */}
        {overdueCount > 0 && (
          <TouchableOpacity
            onPress={() => setShowOverdueOnly((v) => !v)}
            style={[styles.overdueChip, showOverdueOnly && styles.overdueChipActive]}
          >
            <Text style={[styles.overdueChipText, showOverdueOnly && styles.overdueChipTextActive]}>
              ⚠️ Yalnızca gecikenleri göster ({overdueCount})
            </Text>
          </TouchableOpacity>
        )}

        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            onPress={() => setStatusFilter('all')}
            style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
          >
            <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>
              Tümü ({orders.length})
            </Text>
          </TouchableOpacity>
          {ALL_STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const count = orders.filter((o) => o.status === s).length;
            const isActive = statusFilter === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[
                  styles.chip,
                  isActive && { backgroundColor: cfg.color, borderColor: cfg.color },
                ]}
              >
                <Text style={[styles.chipText, isActive && { color: Colors.white }]}>
                  {cfg.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results count */}
        <Text style={styles.resultCount}>{filtered.length} sipariş</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sipariş bulunamadı</Text>
          </View>
        ) : isDesktop ? (
          <View style={styles.tableWrapper}>
            <OrdersTable
              orders={filtered as WorkOrder[]}
              onPress={(order) => router.push(`/(admin)/order/${order.id}` as any)}
              showDoctor
            />
          </View>
        ) : (
          filtered.map((order) => <OrderRow key={order.id} order={order} today={today} />)
        )}

        <TouchableOpacity style={styles.refreshBtn} onPress={loadOrders}>
          <Text style={styles.refreshText}>↻ Yenile</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderRow({ order, today }: { order: ExtendedOrder; today: string }) {
  const cfg = STATUS_CONFIG[order.status];
  const isOverdue = order.delivery_date < today && order.status !== 'teslim_edildi';
  const deliveryDate = new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <View style={[styles.orderCard, isOverdue && styles.orderCardOverdue]}>
      <View style={styles.orderTop}>
        <Text style={styles.orderNum}>{order.order_number}</Text>
        <View style={[styles.badge, { backgroundColor: cfg.bgColor }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={styles.workType}>{order.work_type}</Text>
      <View style={styles.orderMeta}>
        <Text style={styles.metaItem}>👨‍⚕️ {order.doctor_name}</Text>
        <Text style={[styles.metaItem, isOverdue && styles.overdueMeta]}>
          📅 {deliveryDate}{isOverdue ? ' ⚠️' : ''}
        </Text>
        <Text style={styles.metaItem}>🦷 Diş: {order.tooth_numbers.join(', ')}</Text>
        {order.machine_type === 'milling' ? (
          <Text style={styles.metaItem}>⚙️ Frezeleme</Text>
        ) : (
          <Text style={styles.metaItem}>🖨️ 3D Baskı</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  clearBtn: { fontSize: 14, color: Colors.textMuted, padding: 4 },

  overdueChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.overdueBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: Colors.overdueBg,
  },
  overdueChipActive: { backgroundColor: Colors.error, borderColor: Colors.error },
  overdueChipText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  overdueChipTextActive: { color: Colors.white },

  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  resultCount: { fontSize: 13, color: Colors.textMuted, marginTop: 8, marginBottom: 12 },

  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    // @ts-ignore
    boxShadow: '0px 1px 4px rgba(0,0,0,0.06)',
  },
  orderCardOverdue: {
    backgroundColor: Colors.overdueBg,
    borderWidth: 1,
    borderColor: Colors.overdueBorder,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderNum: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  workType: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  orderMeta: { gap: 3 },
  metaItem: { fontSize: 12, color: Colors.textSecondary },
  overdueMeta: { color: Colors.error, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted },

  refreshBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  refreshText: { fontSize: 14, color: '#0F172A', fontWeight: '600' },
  tableWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
});
