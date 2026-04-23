import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOverdueReport } from '../../../modules/admin/reports/hooks';

const C = {
  primary: '#0F172A', primaryBg: '#F1F5F9',
  accent: '#7C3AED', accentBg: '#F5F3FF',
  background: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F8FAFC',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#F1F5F9',
  success: '#059669', successBg: '#ECFDF5',
  warning: '#D97706', warningBg: '#FFFBEB',
  danger: '#DC2626', dangerBg: '#FEF2F2',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',          color: '#0F172A', bgColor: '#F1F5F9' },
  uretimde:         { label: 'Üretimde',         color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',   color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır',  color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',    color: '#374151', bgColor: '#F3F4F6' },
};

type SortMode = 'days' | 'doctor';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

export default function AdminOverdueReportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { report, loading, refresh } = useOverdueReport();
  const [sortMode, setSortMode] = useState<SortMode>('days');

  const sortedOrders = useMemo(() => {
    if (!report) return [];
    const orders = [...report.orders];
    if (sortMode === 'days') {
      return orders.sort((a, b) => b.daysOverdue - a.daysOverdue);
    } else {
      return orders.sort((a, b) => a.doctor_name.localeCompare(b.doctor_name));
    }
  }, [report, sortMode]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Raporlar</Text>
        </TouchableOpacity>

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Gecikmiş Siparişler</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Yükleniyor...</Text>
          </View>
        ) : report ? (
          <>
            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{report.orders.length}</Text>
                <Text style={styles.summaryLabel}>Geciken Sipariş</Text>
              </View>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: C.danger }]}>{report.avgDaysOverdue}</Text>
                <Text style={styles.summaryLabel}>Ort. Gecikme (Gün)</Text>
              </View>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: C.warning, fontSize: 14 }]} numberOfLines={1}>
                  {report.worstDoctor}
                </Text>
                <Text style={styles.summaryLabel}>En Fazla Geciken Hekim</Text>
              </View>
            </View>

            {report.orders.length > 0 ? (
              <>
                {/* Sort controls */}
                <View style={styles.sortRow}>
                  <Text style={styles.sortLabel}>Sırala:</Text>
                  <TouchableOpacity
                    style={[styles.sortChip, sortMode === 'days' && styles.sortChipActive]}
                    onPress={() => setSortMode('days')}
                  >
                    <Text style={[styles.sortChipText, sortMode === 'days' && styles.sortChipTextActive]}>
                      Gecikme Süresi
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortChip, sortMode === 'doctor' && styles.sortChipActive]}
                    onPress={() => setSortMode('doctor')}
                  >
                    <Text style={[styles.sortChipText, sortMode === 'doctor' && styles.sortChipTextActive]}>
                      Hekim
                    </Text>
                  </TouchableOpacity>
                </View>

                {isDesktop ? (
                  <View style={styles.tableContainer}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.th, { flex: 1.2 }]}>Sipariş No</Text>
                      <Text style={[styles.th, { flex: 1.5 }]}>Hekim</Text>
                      <Text style={[styles.th, { flex: 1.5 }]}>İş Tipi</Text>
                      <Text style={[styles.th, { flex: 1 }]}>Teslim Tarihi</Text>
                      <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Gecikme</Text>
                      <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Statü</Text>
                    </View>
                    {sortedOrders.map((order) => (
                      <TouchableOpacity
                        key={order.id}
                        style={styles.tableRow}
                        onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                      >
                        <Text style={[styles.tdText, { flex: 1.2, fontWeight: '700' }]}>{order.order_number}</Text>
                        <Text style={[styles.tdText, { flex: 1.5 }]} numberOfLines={1}>{order.doctor_name}</Text>
                        <Text style={[styles.tdText, { flex: 1.5, color: C.textSecondary }]} numberOfLines={1}>{order.work_type}</Text>
                        <Text style={[styles.tdText, { flex: 1, color: C.danger }]}>{formatDate(order.delivery_date)}</Text>
                        <View style={[{ flex: 0.8, alignItems: 'center' }]}>
                          <View style={styles.overdueBadge}>
                            <Text style={styles.overdueBadgeText}>{order.daysOverdue} gün</Text>
                          </View>
                        </View>
                        <View style={[{ flex: 1, alignItems: 'flex-end' }]}>
                          <StatusBadge status={order.status} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.cardList}>
                    {sortedOrders.map((order) => (
                      <TouchableOpacity
                        key={order.id}
                        style={styles.orderCard}
                        onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                      >
                        <View style={styles.orderCardTop}>
                          <Text style={styles.orderNumber}>{order.order_number}</Text>
                          <View style={styles.overdueBadge}>
                            <Text style={styles.overdueBadgeText}>{order.daysOverdue} gün gecikmiş</Text>
                          </View>
                        </View>
                        <Text style={styles.doctorName}>{order.doctor_name}</Text>
                        <Text style={styles.workType}>{order.work_type}</Text>
                        <View style={styles.orderCardBottom}>
                          <Text style={styles.deliveryDate}>📅 {formatDate(order.delivery_date)}</Text>
                          <StatusBadge status={order.status} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🎉</Text>
                <Text style={styles.emptyTitle}>Gecikmiş sipariş yok!</Text>
                <Text style={styles.emptyDesc}>Tüm siparişler zamanında teslim edilmiş.</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Rapor yüklenemedi</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  backButton: { marginBottom: 12, alignSelf: 'flex-start' },
  backButtonText: { fontSize: 14, color: C.accent, fontWeight: '600' },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: C.textPrimary },
  refreshButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  loadingBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { color: C.textSecondary, fontSize: 14 },
  errorBox: { backgroundColor: C.dangerBg, borderRadius: 12, padding: 16 },
  errorText: { color: C.danger, fontSize: 14 },
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
  },
  summaryLabel: {
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
  },
  summarySep: {
    width: 1,
    height: 40,
    backgroundColor: C.border,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sortLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  sortChip: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortChipActive: { backgroundColor: C.accentBg, borderColor: C.accent },
  sortChipText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  sortChipTextActive: { color: C.accent },
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
  th: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tdText: { fontSize: 13, color: C.textPrimary },
  overdueBadge: {
    backgroundColor: C.dangerBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overdueBadgeText: { fontSize: 11, fontWeight: '700', color: C.danger },
  // Mobile cards
  cardList: { gap: 10 },
  orderCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  doctorName: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  workType: { fontSize: 12, color: C.textSecondary },
  orderCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  deliveryDate: { fontSize: 12, color: C.danger, fontWeight: '600' },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textPrimary },
  emptyDesc: { fontSize: 13, color: C.textSecondary },
});
