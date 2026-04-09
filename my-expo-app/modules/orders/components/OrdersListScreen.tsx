import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrders } from '../hooks/useOrders';
import { WorkOrderCard } from '../components/WorkOrderCard';
import { KanbanBoard } from '../components/KanbanBoard';
import { OrdersTable } from '../components/OrdersTable';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { STATUS_CONFIG } from '../constants';
import { advanceOrderStatus } from '../api';
import { WorkOrder, WorkOrderStatus } from '../types';
import { useAuthStore } from '../../../core/store/authStore';
import { C } from '../../../core/theme/colors';

const STATUS_FILTERS: { value: WorkOrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'alindi', label: 'Alındı' },
  { value: 'uretimde', label: 'Üretimde' },
  { value: 'kalite_kontrol', label: 'KK' },
  { value: 'teslimata_hazir', label: 'Hazır' },
  { value: 'teslim_edildi', label: 'Teslim' },
];

export function OrdersListScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('lab');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'table'>(isDesktop ? 'table' : 'list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleBarcodeSearch = (text: string) => {
    setBarcodeInput(text);
    const match = orders.find(
      (o) => o.order_number.toLowerCase() === text.trim().toLowerCase()
    );
    if (match) {
      setBarcodeInput('');
      router.push(`/(lab)/order/${match.id}`);
    }
  };

  const handleBarcodeSubmit = () => {
    const match = orders.find(
      (o) => o.order_number.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    if (match) {
      setBarcodeInput('');
      router.push(`/(lab)/order/${match.id}`);
    } else if (barcodeInput.trim()) {
      setSearch(barcodeInput.trim());
      setBarcodeInput('');
    }
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const searchLower = search.toLowerCase();
      const matchSearch =
        !search ||
        o.order_number.toLowerCase().includes(searchLower) ||
        (o.doctor?.full_name ?? '').toLowerCase().includes(searchLower) ||
        (o.doctor?.clinic?.name ?? '').toLowerCase().includes(searchLower) ||
        o.work_type.toLowerCase().includes(searchLower);
      return matchStatus && matchSearch;
    });
  }, [orders, statusFilter, search]);

  const handleStatusAdvance = (order: WorkOrder) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (newStatus: WorkOrderStatus, note: string) => {
    if (!selectedOrder || !profile) return;
    const { error } = await advanceOrderStatus(
      selectedOrder.id,
      newStatus,
      profile.id,
      note || undefined
    );
    if (error) Alert.alert('Hata', (error as any).message);
    else refetch();
    setModalVisible(false);
    setSelectedOrder(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>İş Emirleri</Text>
          <Text style={styles.count}>{filtered.length} / {orders.length} sipariş</Text>
        </View>
        {/* View toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            onPress={() => setViewMode('kanban')}
            style={[styles.toggleBtn, viewMode === 'kanban' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, viewMode === 'kanban' && styles.toggleTextActive]}>
              ⬜ Kanban
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('table')}
            style={[styles.toggleBtn, viewMode === 'table' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, viewMode === 'table' && styles.toggleTextActive]}>
              ⊞ Tablo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>
              ☰ Liste
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barcode scanner bar */}
      <View style={styles.barcodeBar}>
        <Text style={styles.barcodeIcon}>📷</Text>
        <TextInput
          style={styles.barcodeInput}
          value={barcodeInput}
          onChangeText={handleBarcodeSearch}
          onSubmitEditing={handleBarcodeSubmit}
          placeholder="Barkod okut veya sipariş no yaz (Enter)..."
          placeholderTextColor={C.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="characters"
        />
      </View>

      {/* Search + filter (list/table mode) */}
      {viewMode !== 'kanban' && (
        <>
          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍  Sipariş no, hekim, iş türü..."
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <View style={styles.filtersWrapper}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={STATUS_FILTERS}
              keyExtractor={(item) => item.value}
              contentContainerStyle={styles.filters}
              renderItem={({ item }) => {
                const active = statusFilter === item.value;
                const config = item.value !== 'all' ? STATUS_CONFIG[item.value as WorkOrderStatus] : null;
                return (
                  <TouchableOpacity
                    onPress={() => setStatusFilter(item.value)}
                    style={[
                      styles.chip,
                      active && styles.chipActive,
                      active && config && { backgroundColor: config.bgColor, borderColor: config.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                        active && config && { color: config.color },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </>
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          orders={orders}
          userGroup="(lab)"
          onStatusAdvance={handleStatusAdvance}
        />
      ) : viewMode === 'table' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Sonuç bulunamadı</Text>
              <Text style={styles.emptySub}>Arama kriterlerinizi değiştirmeyi deneyin.</Text>
            </View>
          ) : (
            <OrdersTable
              orders={filtered}
              onPress={(item) => router.push(`/(lab)/order/${item.id}`)}
              onStatusAdvance={handleStatusAdvance}
              showDoctor
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <WorkOrderCard
              order={item}
              onPress={() => router.push(`/(lab)/order/${item.id}`)}
              showDoctor
            />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Sonuç bulunamadı</Text>
              <Text style={styles.emptySub}>Arama kriterlerinizi değiştirmeyi deneyin.</Text>
            </View>
          }
        />
      )}

      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={handleStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  count: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  toggleText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  toggleTextActive: { color: C.primary },
  barcodeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  barcodeIcon: { fontSize: 18 },
  barcodeInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: C.textPrimary,
    // @ts-ignore
    fontFamily: 'monospace',
  },
  searchWrapper: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: C.textPrimary,
  },
  filtersWrapper: { marginBottom: 4 },
  filters: { paddingHorizontal: 16, gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
  },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  chipText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  chipTextActive: { color: C.primary, fontWeight: '700' },
  list: { padding: 16, paddingTop: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 280 },
});
