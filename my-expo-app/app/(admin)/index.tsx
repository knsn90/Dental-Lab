import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DentistIcon } from '../../components/icons/DentistIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import Colors from '../../constants/colors';
import { STATUS_CONFIG } from '../../constants/status';
import { WorkOrderStatus } from '../../lib/types';

const STATUS_KEYS: WorkOrderStatus[] = [
  'alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi',
];

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

interface Stats {
  totalOrders: number;
  todayOrders: number;
  overdueOrders: number;
  totalDoctors: number;
  totalLabUsers: number;
  byStatus: Record<WorkOrderStatus, number>;
  byWorkType: { label: string; count: number }[];
  byDoctor: { name: string; count: number }[];
  monthly: { month: string; count: number }[];
  recentOrders: {
    id: string; order_number: string; work_type: string;
    status: WorkOrderStatus; delivery_date: string; doctor_name: string;
  }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);

      const [ordersRes, profilesRes, recentRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('status, delivery_date, created_at, work_type, doctor:doctor_id(full_name)'),
        supabase.from('profiles').select('user_type').neq('user_type', 'admin'),
        supabase
          .from('work_orders')
          .select('id, order_number, work_type, status, delivery_date, doctor:doctor_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const orders = (ordersRes.data ?? []) as any[];
      const profiles = profilesRes.data ?? [];
      const recent = (recentRes.data ?? []) as any[];

      // By status
      const byStatus = STATUS_KEYS.reduce(
        (a, s) => ({ ...a, [s]: 0 }),
        {} as Record<WorkOrderStatus, number>
      );
      let todayOrders = 0;
      let overdueOrders = 0;
      const workTypeMap: Record<string, number> = {};
      const doctorMap: Record<string, number> = {};
      const monthMap: Record<string, number> = {};

      for (const o of orders) {
        byStatus[o.status as WorkOrderStatus] = (byStatus[o.status as WorkOrderStatus] ?? 0) + 1;
        if (o.created_at?.startsWith(today)) todayOrders++;
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueOrders++;

        // Work type breakdown
        if (o.work_type) workTypeMap[o.work_type] = (workTypeMap[o.work_type] ?? 0) + 1;

        // Doctor breakdown
        const dName = o.doctor?.full_name;
        if (dName) doctorMap[dName] = (doctorMap[dName] ?? 0) + 1;

        // Monthly (last 6 months)
        if (o.created_at) {
          const d = new Date(o.created_at);
          if (d >= sixMonthsAgo) {
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
            monthMap[key] = (monthMap[key] ?? 0) + 1;
          }
        }
      }

      // Build last 6 months array
      const monthly = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        monthly.push({ month: MONTHS_TR[d.getMonth()], count: monthMap[key] ?? 0 });
      }

      const byWorkType = Object.entries(workTypeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count }));

      const byDoctor = Object.entries(doctorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count }));

      setStats({
        totalOrders: orders.length,
        todayOrders,
        overdueOrders,
        totalDoctors: profiles.filter((p) => p.user_type === 'doctor').length,
        totalLabUsers: profiles.filter((p) => p.user_type === 'lab').length,
        byStatus,
        byWorkType,
        byDoctor,
        monthly,
        recentOrders: recent.map((o) => ({
          id: o.id,
          order_number: o.order_number,
          work_type: o.work_type,
          status: o.status,
          delivery_date: o.delivery_date,
          doctor_name: o.doctor?.full_name ?? '—',
        })),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const maxMonthly = Math.max(...(stats?.monthly.map((m) => m.count) ?? [1]), 1);
  const maxWorkType = Math.max(...(stats?.byWorkType.map((w) => w.count) ?? [1]), 1);
  const maxDoctor = Math.max(...(stats?.byDoctor.map((d) => d.count) ?? [1]), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Yönetim Paneli</Text>
            <Text style={styles.pageSub}>
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadStats}>
            <Text style={styles.refreshText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* Overdue alert */}
        {(stats?.overdueOrders ?? 0) > 0 && (
          <View style={styles.alertCard}>
            <Text style={styles.alertEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{stats!.overdueOrders} geciken sipariş var</Text>
              <Text style={styles.alertSub}>Teslim tarihi geçmiş ve teslim edilmemiş</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(admin)/orders')}>
              <Text style={styles.alertLink}>Görüntüle →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* KPI cards */}
        <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop]}>
          <KpiCard label="Toplam Sipariş" value={stats?.totalOrders ?? 0} color={Colors.primary} icon="file-document-outline" onPress={() => router.push('/(admin)/orders')} />
          <KpiCard label="Bugün Eklenen" value={stats?.todayOrders ?? 0} color={Colors.statusReady} icon="calendar-outline" onPress={() => router.push('/(admin)/orders')} />
          <KpiCard label="Geciken" value={stats?.overdueOrders ?? 0} color={Colors.error} icon="alert-outline" onPress={() => router.push('/(admin)/orders')} />
          <KpiCard label="Kayıtlı Hekim" value={stats?.totalDoctors ?? 0} color={Colors.statusQC} customIcon={<DentistIcon size={22} color={Colors.statusQC} />} onPress={() => router.push('/(admin)/doctors')} />
        </View>

        {/* Charts row */}
        <View style={[styles.chartsRow, isDesktop && styles.chartsRowDesktop]}>
          {/* Monthly bar chart */}
          <View style={[styles.chartCard, isDesktop && { flex: 1.4 }]}>
            <Text style={styles.chartTitle}>Son 6 Ay — Sipariş Sayısı</Text>
            <View style={styles.barChart}>
              {stats?.monthly.map((m, i) => (
                <View key={i} style={styles.barGroup}>
                  <Text style={styles.barValue}>{m.count > 0 ? m.count : ''}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max((m.count / maxMonthly) * 100, m.count > 0 ? 6 : 0)}%`,
                          backgroundColor: '#0F172A',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{m.month}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Status breakdown */}
          <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
            <Text style={styles.chartTitle}>Statü Dağılımı</Text>
            {STATUS_KEYS.map((key) => {
              const cfg = STATUS_CONFIG[key];
              const count = stats?.byStatus[key] ?? 0;
              const pct = stats?.totalOrders ? (count / stats.totalOrders) * 100 : 0;
              return (
                <View key={key} style={styles.hBarRow}>
                  <Text style={styles.hBarLabel}>{cfg.label}</Text>
                  <View style={styles.hBarTrack}>
                    <View style={[styles.hBarFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                  </View>
                  <Text style={styles.hBarCount}>{count}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Work type + Doctor charts */}
        {(stats?.byWorkType.length ?? 0) > 0 || (stats?.byDoctor.length ?? 0) > 0 ? (
          <View style={[styles.chartsRow, isDesktop && styles.chartsRowDesktop]}>
            {(stats?.byWorkType.length ?? 0) > 0 && (
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>İş Tipine Göre</Text>
                {stats!.byWorkType.map((w, i) => (
                  <View key={i} style={styles.hBarRow}>
                    <Text style={styles.hBarLabel} numberOfLines={1}>{w.label}</Text>
                    <View style={styles.hBarTrack}>
                      <View
                        style={[
                          styles.hBarFill,
                          { width: `${(w.count / maxWorkType) * 100}%`, backgroundColor: '#374151' },
                        ]}
                      />
                    </View>
                    <Text style={styles.hBarCount}>{w.count}</Text>
                  </View>
                ))}
              </View>
            )}

            {(stats?.byDoctor.length ?? 0) > 0 && (
              <View style={[styles.chartCard, isDesktop && { flex: 1 }]}>
                <Text style={styles.chartTitle}>Hekime Göre</Text>
                {stats!.byDoctor.map((d, i) => (
                  <View key={i} style={styles.hBarRow}>
                    <Text style={styles.hBarLabel} numberOfLines={1}>{d.name}</Text>
                    <View style={styles.hBarTrack}>
                      <View
                        style={[
                          styles.hBarFill,
                          { width: `${(d.count / maxDoctor) * 100}%`, backgroundColor: '#6B7280' },
                        ]}
                      />
                    </View>
                    <Text style={styles.hBarCount}>{d.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Recent orders */}
        <View style={styles.chartCard}>
          <View style={styles.recentHeader}>
            <Text style={styles.chartTitle}>Son Siparişler</Text>
            <TouchableOpacity onPress={() => router.push('/(admin)/orders')}>
              <Text style={styles.seeAll}>Tümünü gör →</Text>
            </TouchableOpacity>
          </View>
          {stats?.recentOrders.length === 0 ? (
            <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Henüz sipariş yok</Text>
          ) : (
            stats?.recentOrders.map((o) => {
              const cfg = STATUS_CONFIG[o.status];
              const today = new Date().toISOString().split('T')[0];
              const overdue = o.delivery_date < today && o.status !== 'teslim_edildi';
              return (
                <View key={o.id} style={[styles.recentRow, overdue && styles.recentRowOverdue]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentNum}>{o.order_number}</Text>
                    <Text style={styles.recentMeta}>{o.doctor_name} · {o.work_type}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: cfg.bgColor }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ label, value, color, icon, customIcon, onPress }: { label: string; value: number; color: string; icon?: string; customIcon?: React.ReactNode; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.kpiCard, { borderTopColor: color }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={{ marginBottom: 8 }}>
        {customIcon ?? (icon ? <MaterialCommunityIcons name={icon as any} size={22} color={color} /> : null)}
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {onPress && <MaterialCommunityIcons name="arrow-right" size={14} color={color} style={{ marginTop: 4 }} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40 },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  pageSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  refreshBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshText: { fontSize: 13, color: '#0F172A', fontWeight: '600' },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overdueBg,
    borderWidth: 1,
    borderColor: Colors.overdueBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  alertEmoji: { fontSize: 22 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: Colors.error },
  alertSub: { fontSize: 12, color: Colors.error, opacity: 0.8 },
  alertLink: { fontSize: 13, fontWeight: '700', color: Colors.error },

  kpiRow: { flexDirection: 'column', gap: 12, marginBottom: 20 },
  kpiRowDesktop: { flexDirection: 'row' },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderTopWidth: 3,
    alignItems: 'flex-start',
    // @ts-ignore
    boxShadow: '0px 1px 4px rgba(0,0,0,0.06)',
  },
  kpiIcon: { fontSize: 22, marginBottom: 8 },
  kpiValue: { fontSize: 30, fontWeight: '800', marginBottom: 4 },
  kpiLabel: { fontSize: 12, color: Colors.textSecondary },
  kpiArrow: { fontSize: 14, fontWeight: '700', marginTop: 4 },

  chartsRow: { flexDirection: 'column', gap: 16, marginBottom: 16 },
  chartsRowDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 18,
    // @ts-ignore
    boxShadow: '0px 1px 4px rgba(0,0,0,0.06)',
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },

  // Vertical bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 8,
    justifyContent: 'space-between',
  },
  barGroup: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  barTrack: {
    width: '70%',
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 4, minHeight: 3 },
  barLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4 },

  // Horizontal bar chart
  hBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  hBarLabel: { fontSize: 12, color: Colors.textSecondary, width: 90 },
  hBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hBarFill: { height: 8, borderRadius: 4, minWidth: 3 },
  hBarCount: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, width: 24, textAlign: 'right' },

  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  recentRowOverdue: { backgroundColor: Colors.overdueBg },
  recentNum: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  recentMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
