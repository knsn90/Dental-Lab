import React from 'react';
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
import { useAdminDashboard } from '../../modules/admin/orders/hooks';

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

function formatDate(): string {
  const now = new Date();
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function isOverdue(delivery_date: string, status: string): boolean {
  if (status === 'teslim_edildi') return false;
  return new Date(delivery_date) < new Date();
}

function formatDeliveryDate(date: string): string {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

interface StatusBadgeProps {
  status: string;
}
function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

interface BarChartProps {
  data: { label: string; count: number }[];
  color: string;
  horizontal?: boolean;
  maxItems?: number;
}
function BarChart({ data, color, horizontal = false, maxItems = 6 }: BarChartProps) {
  const items = data.slice(0, maxItems);
  const maxVal = Math.max(...items.map((i) => i.count), 1);

  if (horizontal) {
    return (
      <View style={{ gap: 10 }}>
        {items.map((item, idx) => (
          <View key={idx}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: C.textSecondary, flex: 1 }} numberOfLines={1}>{item.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.textPrimary, marginLeft: 8 }}>{item.count}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{
                height: 8, borderRadius: 4, backgroundColor: color,
                width: `${(item.count / maxVal) * 100}%` as any,
              }} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  // Vertical
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 }}>
      {items.map((item, idx) => {
        const barHeight = (item.count / maxVal) * 100;
        return (
          <View key={idx} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.textPrimary }}>{item.count}</Text>
            <View style={{ width: '100%', height: 90, justifyContent: 'flex-end' }}>
              <View style={{
                width: '100%', borderRadius: 4, backgroundColor: color,
                height: `${Math.max(barHeight, 4)}%` as any,
              }} />
            </View>
            <Text style={{ fontSize: 9, color: C.textSecondary, textAlign: 'center' }} numberOfLines={2}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface KpiCardProps {
  emoji: string;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}
function KpiCard({ emoji, label, value, color, bgColor }: KpiCardProps) {
  return (
    <View style={[styles.kpiCard]}>
      <View style={[styles.kpiIconBox, { backgroundColor: bgColor }]}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { stats, loading, refresh } = useAdminDashboard();

  const statusChartData = stats
    ? Object.entries(stats.byStatus).map(([key, count]) => ({
        label: STATUS_CONFIG[key]?.label ?? key,
        count,
      }))
    : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Yönetim Paneli</Text>
            <Text style={styles.pageSubtitle}>{formatDate()}</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Veriler yükleniyor...</Text>
          </View>
        )}

        {!loading && stats && (
          <>
            {/* Overdue alert */}
            {stats.overdueOrders > 0 && (
              <TouchableOpacity
                style={styles.alertCard}
                onPress={() => router.push('/admin/orders' as any)}
              >
                <Text style={styles.alertEmoji}>⚠️</Text>
                <Text style={styles.alertText}>
                  <Text style={{ fontWeight: '700' }}>{stats.overdueOrders} geciken sipariş</Text>
                  {' '}var — Siparişlere git →
                </Text>
              </TouchableOpacity>
            )}

            {/* KPI Cards */}
            <View style={[styles.kpiRow, !isDesktop && styles.kpiGrid]}>
              <KpiCard emoji="📋" label="Toplam Sipariş" value={stats.totalOrders} color={C.accent} bgColor={C.accentBg} />
              <KpiCard emoji="📅" label="Bugün Eklenen" value={stats.todayOrders} color={C.primary} bgColor={C.primaryBg} />
              <KpiCard emoji="⚠️" label="Geciken" value={stats.overdueOrders} color={C.danger} bgColor={C.dangerBg} />
              <KpiCard emoji="👨‍⚕️" label="Kayıtlı Hekim" value={stats.totalDoctors} color={C.success} bgColor={C.successBg} />
              <KpiCard emoji="🔬" label="Lab Kullanıcısı" value={stats.totalLabUsers} color={C.warning} bgColor={C.warningBg} />
            </View>

            {/* Charts row 1: Monthly + Status */}
            <View style={[styles.chartsRow, !isDesktop && styles.chartsCol]}>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>Son 6 Ay Sipariş Sayısı</Text>
                <BarChart data={stats.monthly} color={C.accent} horizontal={false} maxItems={6} />
              </View>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>Statü Dağılımı</Text>
                <BarChart data={statusChartData} color={C.primary} horizontal={true} maxItems={5} />
              </View>
            </View>

            {/* Charts row 2: Work type + Doctor */}
            <View style={[styles.chartsRow, !isDesktop && styles.chartsCol]}>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>İş Tipi Dağılımı</Text>
                <BarChart data={stats.byWorkType} color={C.warning} horizontal={true} maxItems={8} />
              </View>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>Hekim Bazlı Siparişler</Text>
                <BarChart data={stats.byDoctor} color={C.success} horizontal={true} maxItems={8} />
              </View>
            </View>

            {/* Recent orders */}
            <View style={styles.recentCard}>
              <View style={styles.recentHeader}>
                <Text style={styles.chartTitle}>Son Siparişler</Text>
                <TouchableOpacity onPress={() => router.push('/admin/orders' as any)}>
                  <Text style={styles.seeAllLink}>Tümünü Gör →</Text>
                </TouchableOpacity>
              </View>
              {stats.recentOrders.map((order) => {
                const overdue = isOverdue(order.delivery_date, order.status);
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.orderRow}
                    onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                  >
                    <View style={styles.orderRowLeft}>
                      <Text style={styles.orderNumber}>{order.order_number}</Text>
                      {order.is_urgent && (
                        <View style={styles.urgentBadge}>
                          <Text style={styles.urgentBadgeText}>ACİL</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderDoctor} numberOfLines={1}>{order.doctor_name}</Text>
                    <Text style={styles.orderWorkType} numberOfLines={1}>{order.work_type}</Text>
                    <StatusBadge status={order.status} />
                    <Text style={[styles.orderDate, overdue && styles.overdueText]}>
                      {formatDeliveryDate(order.delivery_date)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
  },
  pageSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
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
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: C.textSecondary,
    fontSize: 14,
  },
  alertCard: {
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alertEmoji: {
    fontSize: 18,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    color: C.danger,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  kpiGrid: {
    flexWrap: 'wrap',
  },
  kpiCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minWidth: 120,
    alignItems: 'center',
    gap: 8,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  kpiIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  kpiLabel: {
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  chartsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  chartsCol: {
    flexDirection: 'column',
  },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 0,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 14,
  },
  recentCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllLink: {
    fontSize: 13,
    color: C.accent,
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexWrap: 'wrap',
  },
  orderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
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
  orderDoctor: {
    flex: 1,
    fontSize: 13,
    color: C.textSecondary,
    minWidth: 80,
  },
  orderWorkType: {
    flex: 1,
    fontSize: 12,
    color: C.textMuted,
    minWidth: 80,
  },
  orderDate: {
    fontSize: 12,
    color: C.textSecondary,
    minWidth: 80,
    textAlign: 'right',
  },
  overdueText: {
    color: C.danger,
    fontWeight: '700',
  },
});
