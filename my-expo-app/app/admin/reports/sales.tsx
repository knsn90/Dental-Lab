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
import { useSalesReport } from '../../../modules/admin/reports/hooks';

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

const DATE_RANGES: { label: string; value: 30 | 60 | 90 }[] = [
  { label: '30 Gün', value: 30 },
  { label: '60 Gün', value: 60 },
  { label: '90 Gün', value: 90 },
];

interface BarChartVerticalProps {
  data: { month: string; count: number; completedCount: number }[];
  color: string;
  completedColor: string;
}
function BarChartVertical({ data, color, completedColor }: BarChartVerticalProps) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  return (
    <View style={styles.vchartContainer}>
      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>Toplam</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: completedColor }]} />
          <Text style={styles.legendText}>Tamamlanan</Text>
        </View>
      </View>
      <View style={styles.vchartBars}>
        {data.map((item, idx) => {
          const totalH = (item.count / maxVal) * 100;
          const completedH = (item.completedCount / maxVal) * 100;
          return (
            <View key={idx} style={styles.vchartBarGroup}>
              <Text style={styles.vchartValue}>{item.count}</Text>
              <View style={styles.vchartBarTrack}>
                <View style={[styles.vchartBarFill, { height: `${Math.max(totalH, 4)}%` as any, backgroundColor: color }]} />
                <View style={[styles.vchartBarFill2, { height: `${Math.max(completedH, 2)}%` as any, backgroundColor: completedColor }]} />
              </View>
              <Text style={styles.vchartLabel} numberOfLines={2}>{item.month}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface HBarProps {
  label: string;
  count: number;
  maxCount: number;
  color: string;
  percentage?: number;
}
function HBar({ label, count, maxCount, color, percentage }: HBarProps) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={styles.hbarValue}>{count}{percentage !== undefined ? ` (%${percentage})` : ''}</Text>
    </View>
  );
}

export default function AdminSalesReportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { report, loading, dateRange, setDateRange } = useSalesReport();

  const maxWorkType = report ? Math.max(...report.byWorkType.map((w) => w.count), 1) : 1;

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

        <Text style={styles.pageTitle}>Üretim Raporu</Text>

        {/* Date range selector */}
        <View style={styles.rangeRow}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.rangeChip, dateRange === r.value && styles.rangeChipActive]}
              onPress={() => setDateRange(r.value)}
            >
              <Text style={[styles.rangeChipText, dateRange === r.value && styles.rangeChipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Rapor hazırlanıyor...</Text>
          </View>
        ) : report ? (
          <>
            {/* KPI row */}
            <View style={[styles.kpiRow, !isDesktop && styles.kpiWrap]}>
              <View style={[styles.kpiCard, { borderTopColor: C.accent }]}>
                <Text style={[styles.kpiValue, { color: C.accent }]}>{report.totalOrders}</Text>
                <Text style={styles.kpiLabel}>Toplam</Text>
              </View>
              <View style={[styles.kpiCard, { borderTopColor: C.success }]}>
                <Text style={[styles.kpiValue, { color: C.success }]}>{report.completedOrders}</Text>
                <Text style={styles.kpiLabel}>Tamamlanan</Text>
              </View>
              <View style={[styles.kpiCard, { borderTopColor: C.danger }]}>
                <Text style={[styles.kpiValue, { color: C.danger }]}>{report.overdueOrders}</Text>
                <Text style={styles.kpiLabel}>Geciken</Text>
              </View>
              <View style={[styles.kpiCard, { borderTopColor: C.primary }]}>
                <Text style={[styles.kpiValue, { color: C.primary }]}>%{report.completionRate}</Text>
                <Text style={styles.kpiLabel}>Oran</Text>
              </View>
            </View>

            {/* Monthly bar chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Aylık Sipariş Dağılımı</Text>
              <BarChartVertical data={report.monthly} color={C.accent} completedColor={C.success} />
            </View>

            {/* Work type bars */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>İş Tipi Dağılımı</Text>
              {report.byWorkType.slice(0, 10).map((w, i) => (
                <HBar key={i} label={w.type} count={w.count} maxCount={maxWorkType} color={C.warning} percentage={w.percentage} />
              ))}
              {report.byWorkType.length === 0 && <Text style={styles.emptyText}>Veri yok</Text>}
            </View>

            {/* Doctor performance table */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Hekim Performansı</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Hekim</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Toplam</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Tamamlanan</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Oran (%)</Text>
              </View>
              {report.byDoctor.map((d, i) => {
                const rate = d.count > 0 ? Math.round((d.completedCount / d.count) * 100) : 0;
                return (
                  <View key={i} style={styles.tableRow}>
                    <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{d.name}</Text>
                    <Text style={[styles.tdCenter, { flex: 1 }]}>{d.count}</Text>
                    <Text style={[styles.tdCenter, { flex: 1, color: C.success }]}>{d.completedCount}</Text>
                    <Text style={[styles.tdRight, { flex: 1, color: rate >= 80 ? C.success : rate >= 50 ? C.warning : C.danger }]}>
                      %{rate}
                    </Text>
                  </View>
                );
              })}
              {report.byDoctor.length === 0 && <Text style={styles.emptyText}>Veri yok</Text>}
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
  backButton: { marginBottom: 12, alignSelf: 'flex-start' },
  backButtonText: { fontSize: 14, color: C.accent, fontWeight: '600' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginBottom: 16 },
  rangeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  rangeChip: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  rangeChipActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  rangeChipTextActive: { color: C.accent },
  loadingBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { color: C.textSecondary, fontSize: 14 },
  errorBox: { backgroundColor: C.dangerBg, borderRadius: 12, padding: 16 },
  errorText: { color: C.danger, fontSize: 14 },
  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  kpiWrap: { flexWrap: 'wrap' },
  kpiCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 3,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  kpiValue: { fontSize: 24, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '500', textAlign: 'center' },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: C.textPrimary, marginBottom: 14 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 16 },
  // Vertical chart
  vchartContainer: {},
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: C.textSecondary },
  vchartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 130 },
  vchartBarGroup: { flex: 1, alignItems: 'center', gap: 4 },
  vchartValue: { fontSize: 10, fontWeight: '700', color: C.textPrimary },
  vchartBarTrack: { width: '100%', height: 90, justifyContent: 'flex-end', position: 'relative' },
  vchartBarFill: { width: '100%', borderRadius: 4, position: 'absolute', bottom: 0 },
  vchartBarFill2: { width: '60%', borderRadius: 4, position: 'absolute', bottom: 0, left: '20%' },
  vchartLabel: { fontSize: 9, color: C.textSecondary, textAlign: 'center' },
  // H bars
  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  hbarLabel: { fontSize: 12, color: C.textSecondary, width: 110 },
  hbarTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  hbarFill: { height: 8, borderRadius: 4 },
  hbarValue: { fontSize: 11, fontWeight: '700', color: C.textPrimary, minWidth: 55, textAlign: 'right' },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.surfaceAlt,
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  th: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'center',
  },
  td: { fontSize: 13, color: C.textPrimary },
  tdCenter: { fontSize: 13, color: C.textPrimary, textAlign: 'center' },
  tdRight: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
