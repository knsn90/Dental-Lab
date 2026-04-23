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
import { useOverviewReport } from '../../../modules/admin/reports/hooks';

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

interface HBarProps {
  label: string;
  count: number;
  maxCount: number;
  color: string;
  extra?: string;
}
function HBar({ label, count, maxCount, color, extra }: HBarProps) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={styles.hbarValue}>{count}{extra ? ` ${extra}` : ''}</Text>
    </View>
  );
}

interface KpiCardProps {
  emoji: string;
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
}
function KpiCard({ emoji, label, value, color, bgColor }: KpiCardProps) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: bgColor }]}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function AdminReportsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { report, loading, refresh } = useOverviewReport();

  const maxWorkType = report ? Math.max(...report.byWorkType.map((w) => w.count), 1) : 1;
  const maxDoctor = report ? Math.max(...report.byDoctor.map((d) => d.count), 1) : 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Raporlar</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Raporlar hazırlanıyor...</Text>
          </View>
        ) : report ? (
          <>
            {/* KPI Cards */}
            <View style={[styles.kpiRow, !isDesktop && styles.kpiWrap]}>
              <KpiCard emoji="📋" label="Toplam Sipariş" value={report.totalOrders} color={C.accent} bgColor={C.accentBg} />
              <KpiCard emoji="✅" label="Tamamlanan" value={report.completedOrders} color={C.success} bgColor={C.successBg} />
              <KpiCard emoji="⚠️" label="Geciken" value={report.overdueOrders} color={C.danger} bgColor={C.dangerBg} />
              <KpiCard emoji="📊" label="Tamamlanma Oranı" value={`%${report.completionRate}`} color={C.primary} bgColor={C.primaryBg} />
            </View>

            {/* Navigation cards */}
            <View style={[styles.navCardsRow, !isDesktop && styles.navCardsCol]}>
              <TouchableOpacity
                style={[styles.navCard, { borderLeftColor: C.accent }]}
                onPress={() => router.push('/admin/reports/sales' as any)}
              >
                <Text style={styles.navCardEmoji}>📈</Text>
                <View style={styles.navCardContent}>
                  <Text style={styles.navCardTitle}>Üretim Raporu</Text>
                  <Text style={styles.navCardDesc}>Tarih aralığına göre üretim istatistikleri</Text>
                </View>
                <Text style={styles.navCardArrow}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navCard, { borderLeftColor: C.danger }]}
                onPress={() => router.push('/admin/reports/overdue' as any)}
              >
                <Text style={styles.navCardEmoji}>⏰</Text>
                <View style={styles.navCardContent}>
                  <Text style={styles.navCardTitle}>Gecikmiş Siparişler</Text>
                  <Text style={styles.navCardDesc}>{report.overdueOrders} sipariş gecikmiş durumda</Text>
                </View>
                <Text style={styles.navCardArrow}>→</Text>
              </TouchableOpacity>
            </View>

            {/* Charts */}
            <View style={[styles.chartsRow, !isDesktop && styles.chartsCol]}>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>İş Tipi Dağılımı</Text>
                {report.byWorkType.slice(0, 8).map((w, i) => (
                  <HBar key={i} label={w.label ?? w.type} count={w.count} maxCount={maxWorkType} color={C.warning} extra={`(%${w.percentage})`} />
                ))}
                {report.byWorkType.length === 0 && (
                  <Text style={styles.emptyText}>Veri yok</Text>
                )}
              </View>
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>Hekim Bazlı Sipariş</Text>
                {report.byDoctor.slice(0, 8).map((d, i) => (
                  <HBar key={i} label={d.name} count={d.count} maxCount={maxDoctor} color={C.success} />
                ))}
                {report.byDoctor.length === 0 && (
                  <Text style={styles.emptyText}>Veri yok</Text>
                )}
              </View>
            </View>
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
  loadingText: { color: C.textSecondary, fontSize: 14 },
  errorBox: {
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    padding: 16,
  },
  errorText: { color: C.danger, fontSize: 14 },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  kpiWrap: {
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
  kpiIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  kpiLabel: {
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  navCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  navCardsCol: {
    flexDirection: 'column',
  },
  navCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  navCardEmoji: { fontSize: 24 },
  navCardContent: { flex: 1 },
  navCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 3,
  },
  navCardDesc: {
    fontSize: 12,
    color: C.textSecondary,
  },
  navCardArrow: {
    fontSize: 18,
    color: C.textMuted,
    fontWeight: '700',
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
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    marginBottom: 0,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 14,
  },
  hbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  hbarLabel: {
    fontSize: 12,
    color: C.textSecondary,
    width: 110,
  },
  hbarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: C.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hbarFill: {
    height: 8,
    borderRadius: 4,
  },
  hbarValue: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textPrimary,
    minWidth: 40,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
