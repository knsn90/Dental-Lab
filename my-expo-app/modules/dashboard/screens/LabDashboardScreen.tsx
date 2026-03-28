import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { StatCard } from '../components/StatCard';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { C } from '../../../core/theme/colors';
import { supabase } from '../../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TodayProva {
  id: string;
  prova_number: number;
  prova_type: string | null;
  scheduled_date: string | null;
  status: string;
  order_item_name: string | null;
  work_order: {
    id: string;
    order_number: string;
    patient_name: string | null;
    doctor?: { full_name: string; clinic_name?: string | null; clinic?: { name: string } | null };
  } | null;
}

interface MonthBar { month: string; count: number; }

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',         color: '#2563EB', bgColor: '#EFF6FF' },
  uretimde:         { label: 'Üretimde',        color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',  color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır', color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',   color: '#374151', bgColor: '#F3F4F6' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Mini Bar Chart (View-based, no lib) ─────────────────────────────────────
function MonthlyChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={chart.wrap}>
      <View style={chart.bars}>
        {data.map((d, i) => (
          <View key={i} style={chart.barCol}>
            <Text style={chart.barValue}>{d.count > 0 ? d.count : ''}</Text>
            <View style={chart.barTrack}>
              <View
                style={[
                  chart.barFill,
                  {
                    height: `${Math.max((d.count / max) * 100, 4)}%` as any,
                    backgroundColor: i === data.length - 1 ? C.primary : '#BFDBFE',
                  },
                ]}
              />
            </View>
            <Text style={chart.barLabel}>{d.month}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const chart = StyleSheet.create({
  wrap: { height: 120, paddingVertical: 4 },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 2,
    fontWeight: '600',
  },
  barTrack: {
    width: '80%',
    height: '75%',
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
});

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textMuted, bgColor: '#F3F4F6' };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function LabDashboardScreen() {
  const router  = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [provas, setProvas]               = useState<TodayProva[]>([]);
  const [provasLoading, setProvasLoading] = useState(true);
  const [monthly, setMonthly]             = useState<MonthBar[]>([]);
  const [allOrders, setAllOrders]         = useState<any[]>([]);
  const [refreshing, setRefreshing]       = useState(false);

  // Derived stats
  const today          = todayStr();
  const overdueOrders  = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const readyCount     = orders.filter(o => o.status === 'teslimata_hazir').length;
  const inProdCount    = orders.filter(o => o.status === 'uretimde').length;

  // Load monthly chart data + recent orders
  const loadExtra = async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      setAllOrders(data.slice(0, 10));

      // Build monthly bars (last 6 months)
      const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const y = d.getFullYear(), m = d.getMonth();
        const count = data.filter(o => {
          const c = new Date(o.created_at);
          return c.getFullYear() === y && c.getMonth() === m;
        }).length;
        bars.push({ month: monthNames[m], count });
      }
      setMonthly(bars);
    }
  };

  const loadProvas = async () => {
    setProvasLoading(true);
    const { data } = await fetchTodayProvas();
    setProvas((data as TodayProva[]) ?? []);
    setProvasLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadProvas(), loadExtra()]);
    setRefreshing(false);
  };

  useEffect(() => { loadProvas(); loadExtra(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} />}
      >
        {/* ── Page header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.greeting}>Hoş geldin, {profile?.full_name?.split(' ')[0]} 👋</Text>
            <Text style={s.pageTitle}>Dashboard</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh}>
            <Text style={s.refreshBtnText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Overdue alert ── */}
        {overdueOrders.length > 0 && (
          <TouchableOpacity
            style={s.alertCard}
            onPress={() => router.push('/(lab)/all-orders' as any)}
          >
            <Text style={s.alertEmoji}>⚠️</Text>
            <Text style={s.alertText}>
              {overdueOrders.length} geciken iş var — görüntülemek için tıklayın
            </Text>
            <Text style={s.alertArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── KPI cards ── */}
        <View style={[s.kpiRow, isDesktop && s.kpiRowDesktop]}>
          <StatCard
            label="Bugün Teslim"
            value={orders.length}
            accent={C.primary}
            accentBg={C.primaryBg}
            icon="📦"
            trend={String(orders.length)}
            trendUp
          />
          <StatCard
            label="Hazır"
            value={readyCount}
            accent={C.statusHazir}
            accentBg={C.successBg}
            icon="✅"
            trend={String(readyCount)}
            trendUp
          />
          <StatCard
            label="Üretimde"
            value={inProdCount}
            accent={C.statusUretimde}
            accentBg={C.warningBg}
            icon="⚙️"
          />
          <StatCard
            label="Geciken"
            value={overdueOrders.length}
            accent={overdueOrders.length > 0 ? C.danger : C.textMuted}
            accentBg={overdueOrders.length > 0 ? C.dangerBg : C.background}
            icon="⏰"
            trend={overdueOrders.length > 0 ? String(overdueOrders.length) : undefined}
            trendUp={false}
          />
        </View>

        {/* ── Charts row ── */}
        <View style={[s.chartsRow, isDesktop && s.chartsRowDesktop]}>
          {/* Monthly chart */}
          <View style={[s.card, isDesktop ? { flex: 2 } : {}]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>İş Akışı</Text>
              <Text style={s.cardSub}>Son 6 ay</Text>
            </View>
            {monthly.length > 0
              ? <MonthlyChart data={monthly} />
              : <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>Yükleniyor...</Text>
                </View>
            }
          </View>

          {/* Status distribution */}
          <View style={[s.card, isDesktop ? { flex: 1 } : {}]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Statü Dağılımı</Text>
            </View>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = allOrders.filter(o => o.status === key).length;
              const total = allOrders.length || 1;
              const pct   = Math.round((count / total) * 100);
              return (
                <View key={key} style={s.distRow}>
                  <View style={s.distLabelRow}>
                    <View style={[s.distDot, { backgroundColor: cfg.color }]} />
                    <Text style={s.distLabel}>{cfg.label}</Text>
                    <Text style={[s.distPct, { color: cfg.color }]}>{count}</Text>
                  </View>
                  <View style={s.distTrack}>
                    <View style={[s.distFill, { width: `${pct}%` as any, backgroundColor: cfg.color }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Today's provas ── */}
        {(provas.length > 0 || provasLoading) && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Bugünün Provaları</Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{provas.length}</Text>
              </View>
            </View>
            {provasLoading
              ? <Text style={s.loadingText}>Yükleniyor...</Text>
              : provas.map(p => {
                  const typeCfg = PROVA_TYPES.find(t => t.value === p.prova_type);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={s.tableRow}
                      onPress={() => p.work_order && router.push(`/(lab)/order/${p.work_order.id}` as any)}
                    >
                      <Text style={s.provaEmoji}>{typeCfg?.emoji ?? '🦷'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.tableMain}>
                          {p.work_order?.order_number ?? '—'}
                          {p.work_order?.patient_name ? ` · ${p.work_order.patient_name}` : ''}
                        </Text>
                        <Text style={s.tableSub}>
                          {typeCfg?.label ?? 'Prova'} #{p.prova_number}
                          {p.order_item_name ? ` — ${p.order_item_name}` : ''}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#EFF6FF' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: C.primary }}>{p.status}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
            }
          </View>
        )}

        {/* ── Recent orders table ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Son İşler</Text>
            <TouchableOpacity onPress={() => router.push('/(lab)/all-orders' as any)}>
              <Text style={s.seeAll}>Tümünü Gör ›</Text>
            </TouchableOpacity>
          </View>

          {/* Table header */}
          <View style={[s.tableRow, s.tableHead]}>
            <Text style={[s.tableHeadCell, { flex: 2 }]}>Sipariş No</Text>
            {isDesktop && <Text style={[s.tableHeadCell, { flex: 2 }]}>Hekim</Text>}
            <Text style={[s.tableHeadCell, { flex: 2 }]}>İş Tipi</Text>
            <Text style={[s.tableHeadCell, { flex: 1 }]}>Statü</Text>
            {isDesktop && <Text style={[s.tableHeadCell, { flex: 1 }]}>Teslim</Text>}
          </View>

          {allOrders.length === 0
            ? <Text style={s.loadingText}>Yükleniyor...</Text>
            : allOrders.map(order => {
                const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={s.tableRow}
                    onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                  >
                    <Text style={[s.tableMain, { flex: 2 }]} numberOfLines={1}>{order.order_number}</Text>
                    {isDesktop && (
                      <Text style={[s.tableSub, { flex: 2 }]} numberOfLines={1}>
                        {(order.doctor as any)?.full_name ?? '—'}
                      </Text>
                    )}
                    <Text style={[s.tableSub, { flex: 2 }]} numberOfLines={1}>{order.work_type}</Text>
                    <View style={{ flex: 1 }}>
                      <StatusBadge status={order.status} />
                    </View>
                    {isDesktop && (
                      <Text style={[s.tableSub, { flex: 1, color: overdue ? C.danger : C.textMuted }]}>
                        {formatDate(order.delivery_date)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 40, gap: 14, backgroundColor: '#FFFFFF' },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  greeting:  { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: C.textPrimary },
  refreshBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  refreshBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  alertEmoji: { fontSize: 16 },
  alertText:  { flex: 1, fontSize: 13, color: C.danger, fontWeight: '600' },
  alertArrow: { fontSize: 18, color: C.danger },

  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiRowDesktop: { flexWrap: 'nowrap' },

  chartsRow:        { gap: 12 },
  chartsRowDesktop: { flexDirection: 'row' },

  // White card
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  cardSub:   { fontSize: 12, color: C.textMuted },

  countBadge: {
    backgroundColor: C.primary,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  seeAll: { fontSize: 13, color: C.primary, fontWeight: '600' },

  // Status distribution bars
  distRow:      { paddingHorizontal: 16, paddingVertical: 7 },
  distLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  distDot:      { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  distLabel:    { flex: 1, fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  distPct:      { fontSize: 12, fontWeight: '700' },
  distTrack:    { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  distFill:     { height: 5, borderRadius: 3 },

  // Table
  tableHead: {
    backgroundColor: C.background,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableHeadCell: { fontSize: 11, fontWeight: '700', color: C.textMuted, paddingHorizontal: 16, paddingVertical: 10 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  tableMain: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  tableSub:  { fontSize: 12, color: C.textSecondary },

  provaEmoji: { fontSize: 18, width: 28, textAlign: 'center' },
  loadingText: { fontSize: 13, color: C.textMuted, padding: 16, textAlign: 'center' },
});
