import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAdminOrders } from '../../../modules/admin/orders/hooks';

const C = {
  primary: '#2563EB', primaryBg: '#EFF6FF',
  accent: '#7C3AED', accentBg: '#F5F3FF',
  background: '#E8EDF5', surface: '#FFFFFF', surfaceAlt: '#F8FAFC',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#E2E8F0',
  success: '#059669', successBg: '#ECFDF5',
  warning: '#D97706', warningBg: '#FFFBEB',
  danger: '#DC2626', dangerBg: '#FEF2F2',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',          color: '#2563EB', bgColor: '#EFF6FF' },
  uretimde:         { label: 'Üretimde',         color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',   color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır',  color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',    color: '#374151', bgColor: '#F3F4F6' },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'alindi', label: 'Alındı' },
  { key: 'uretimde', label: 'Üretimde' },
  { key: 'kalite_kontrol', label: 'Kalite Kontrol' },
  { key: 'teslimata_hazir', label: 'Teslimata Hazır' },
  { key: 'teslim_edildi', label: 'Teslim Edildi' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function isOverdue(delivery_date: string, status: string): boolean {
  if (status === 'teslim_edildi') return false;
  return new Date(delivery_date) < new Date();
}

function getDaysOverdue(delivery_date: string): number {
  const diff = new Date().getTime() - new Date(delivery_date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

export default function AdminOrdersScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { orders, loading, error, refresh, filter } = useAdminOrders();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(
    () => filter(statusFilter === 'all' ? null : statusFilter, search, overdueOnly),
    [orders, statusFilter, search, overdueOnly, filter]
  );

  const overdueCount = useMemo(
    () => orders.filter((o) => isOverdue(o.delivery_date, o.status)).length,
    [orders]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    });
    return counts;
  }, [orders]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.pageTitle}>Tüm Siparişler</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{orders.length}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Sipariş no, hekim, klinik veya iş tipi ara..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            const count = f.key === 'all' ? orders.length : (statusCounts[f.key] ?? 0);
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Overdue chip */}
          <TouchableOpacity
            style={[styles.filterChip, overdueOnly && styles.filterChipDanger]}
            onPress={() => setOverdueOnly((v) => !v)}
          >
            <Text style={[styles.filterChipText, overdueOnly && styles.filterChipTextDanger]}>
              ⚠️ Geciken
            </Text>
            <View style={[styles.filterCount, overdueOnly && styles.filterCountDanger]}>
              <Text style={[styles.filterCountText, overdueOnly && styles.filterCountTextDanger]}>
                {overdueCount}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Result count */}
        <Text style={styles.resultCount}>{filtered.length} sipariş</Text>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Siparişler yükleniyor...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && (
          <>
            {isDesktop ? (
              /* Desktop Table */
              <View style={styles.tableContainer}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 1.2 }]}>Sipariş No</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Hekim / Klinik</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>İş Tipi</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Statü</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Teslim Tarihi</Text>
                  <Text style={[styles.th, { flex: 0.8 }]}>Gecikme</Text>
                  <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>İşlemler</Text>
                </View>
                {filtered.map((order) => {
                  const overdue = isOverdue(order.delivery_date, order.status);
                  const days = overdue ? getDaysOverdue(order.delivery_date) : 0;
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.tableRow}
                      onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                    >
                      <View style={[styles.td, { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <Text style={styles.orderNumber}>{order.order_number}</Text>
                        {order.is_urgent && (
                          <View style={styles.urgentBadge}>
                            <Text style={styles.urgentBadgeText}>ACİL</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.td, { flex: 2 }]}>
                        <Text style={styles.doctorName} numberOfLines={1}>{order.doctor_name}</Text>
                        <Text style={styles.clinicName} numberOfLines={1}>{order.clinic_name}</Text>
                      </View>
                      <Text style={[styles.tdText, { flex: 1.5 }]} numberOfLines={1}>{order.work_type}</Text>
                      <View style={[styles.td, { flex: 1 }]}>
                        <StatusBadge status={order.status} />
                      </View>
                      <Text style={[styles.tdText, { flex: 1 }, overdue && styles.overdueText]}>
                        {formatDate(order.delivery_date)}
                      </Text>
                      <View style={[styles.td, { flex: 0.8 }]}>
                        {overdue ? (
                          <View style={styles.overdueBadge}>
                            <Text style={styles.overdueBadgeText}>{days} gün</Text>
                          </View>
                        ) : (
                          <Text style={styles.tdMuted}>—</Text>
                        )}
                      </View>
                      <View style={[styles.td, { flex: 0.8, alignItems: 'flex-end' }]}>
                        <TouchableOpacity
                          style={styles.detailButton}
                          onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                        >
                          <Text style={styles.detailButtonText}>Detay →</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {filtered.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Sipariş bulunamadı</Text>
                  </View>
                )}
              </View>
            ) : (
              /* Mobile Card List */
              <View style={styles.cardList}>
                {filtered.map((order) => {
                  const overdue = isOverdue(order.delivery_date, order.status);
                  const days = overdue ? getDaysOverdue(order.delivery_date) : 0;
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.orderCard}
                      onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                    >
                      <View style={styles.orderCardHeader}>
                        <View style={styles.orderCardHeaderLeft}>
                          <Text style={styles.orderNumber}>{order.order_number}</Text>
                          {order.is_urgent && (
                            <View style={styles.urgentBadge}>
                              <Text style={styles.urgentBadgeText}>ACİL</Text>
                            </View>
                          )}
                        </View>
                        <StatusBadge status={order.status} />
                      </View>
                      <Text style={styles.doctorName}>{order.doctor_name}</Text>
                      <Text style={styles.clinicName}>{order.clinic_name}</Text>
                      <Text style={styles.workType}>{order.work_type}</Text>
                      <View style={styles.orderCardFooter}>
                        <Text style={[styles.deliveryDate, overdue && styles.overdueText]}>
                          📅 {formatDate(order.delivery_date)}
                        </Text>
                        {overdue && (
                          <View style={styles.overdueBadge}>
                            <Text style={styles.overdueBadgeText}>{days} gün gecikmiş</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {filtered.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Sipariş bulunamadı</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
  },
  countBadge: {
    backgroundColor: C.accentBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accent,
  },
  refreshButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.textPrimary,
    // @ts-ignore
    outlineStyle: 'none',
  },
  clearIcon: {
    fontSize: 14,
    color: C.textMuted,
    paddingHorizontal: 4,
  },
  filterRow: {
    marginBottom: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  filterChipDanger: {
    backgroundColor: C.dangerBg,
    borderColor: C.danger,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
  },
  filterChipTextActive: {
    color: C.accent,
  },
  filterChipTextDanger: {
    color: C.danger,
  },
  filterCount: {
    backgroundColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountActive: { backgroundColor: C.accent },
  filterCountDanger: { backgroundColor: C.danger },
  filterCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSecondary,
  },
  filterCountTextActive: { color: '#FFFFFF' },
  filterCountTextDanger: { color: '#FFFFFF' },
  resultCount: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 12,
    fontWeight: '500',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: C.textSecondary,
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  errorText: {
    color: C.danger,
    fontSize: 14,
  },
  // Desktop table
  tableContainer: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  td: {
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 13,
    color: C.textPrimary,
  },
  tdMuted: {
    fontSize: 13,
    color: C.textMuted,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
  },
  urgentBadge: {
    backgroundColor: C.dangerBg,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.danger,
  },
  doctorName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
  },
  clinicName: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 1,
  },
  overdueText: {
    color: C.danger,
    fontWeight: '700',
  },
  overdueBadge: {
    backgroundColor: C.dangerBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overdueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.danger,
  },
  detailButton: {
    backgroundColor: C.accentBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: C.textMuted,
  },
  // Mobile card list
  cardList: {
    gap: 10,
  },
  orderCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  orderCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workType: {
    fontSize: 12,
    color: C.textMuted,
  },
  orderCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  deliveryDate: {
    fontSize: 12,
    color: C.textSecondary,
  },
});
