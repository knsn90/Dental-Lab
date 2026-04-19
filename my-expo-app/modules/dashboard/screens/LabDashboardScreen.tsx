import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '../../../core/store/authStore';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { supabase } from '../../../core/api/supabase';

// ─── Lab accent ───────────────────────────────────────────────────────────────
const P  = '#2563EB';
const BG = '#FFFFFF';

const CLR = {
  blue:   '#2563EB', blueBg:   '#EFF6FF',
  green:  '#16A34A', greenBg:  '#DCFCE7',
  orange: '#D97706', orangeBg: '#FEF3C7',
  red:    '#EF4444', redBg:    '#FEF2F2',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TodayProva {
  id: string; prova_number: number; prova_type: string | null;
  scheduled_date: string | null; status: string; order_item_name: string | null;
  work_order: {
    id: string; order_number: string; patient_name: string | null;
    doctor?: { full_name: string; clinic?: { name: string } | null };
  } | null;
}
interface MonthBar { month: string; count: number; }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#64748B', bg: '#F1F5F9' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#7C3AED', bg: '#EDE9FE' },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#94A3B8',  bg: '#F8FAFC' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function getTodayLabel() {
  const d = new Date();
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bg, gap: 4 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, bg, delta }: {
  icon: string; label: string; value: number | string;
  color: string; bg: string; delta?: number;
}) {
  return (
    <View style={kc.card}>
      <View style={kc.top}>
        <View style={[kc.iconCircle, { backgroundColor: bg }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
        {delta !== undefined && delta !== 0 && (
          <View style={[kc.delta, { backgroundColor: delta > 0 ? CLR.greenBg : CLR.redBg }]}>
            <MaterialCommunityIcons
              name={delta > 0 ? 'trending-up' : 'trending-down'}
              size={11}
              color={delta > 0 ? CLR.green : CLR.red}
            />
            <Text style={[kc.deltaText, { color: delta > 0 ? CLR.green : CLR.red }]}>
              {Math.abs(delta)}
            </Text>
          </View>
        )}
      </View>
      <Text style={kc.value}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
    </View>
  );
}
const kc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  iconCircle:{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  delta:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  deltaText:{ fontSize: 10, fontWeight: '700' },
  value:    { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -1, marginBottom: 4 },
  label:    { fontSize: 12, fontWeight: '500', color: '#94A3B8' },
});

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {text}
      </Text>
      {action && (
        <TouchableOpacity onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 12, color: P, fontWeight: '600' }}>{action}</Text>
          <Feather name="chevron-right" size={13} color={P} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}
function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={card.header}>
      <View style={{ flex: 1 }}>
        <Text style={card.title}>{title}</Text>
        {sub && <Text style={card.sub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}
const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  title: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  sub:   { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});

// ─── Monthly Chart ────────────────────────────────────────────────────────────
function MonthlyChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 16 }}>
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 6);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            {d.count > 0 && (
              <Text style={{ fontSize: 10, fontWeight: '700', color: isLast ? P : '#94A3B8', marginBottom: 5 }}>
                {d.count}
              </Text>
            )}
            <View style={{ width: '80%', height: '75%', justifyContent: 'flex-end', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden' }}>
              <View style={{ width: '100%', borderRadius: 8, height: `${pct}%` as any,
                backgroundColor: isLast ? P : `${P}30` }} />
            </View>
            <Text style={{ fontSize: 10, color: isLast ? P : '#94A3B8', marginTop: 7, fontWeight: isLast ? '700' : '500' }}>
              {d.month}
            </Text>
          </View>
        );
      })}
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

  const [provas,        setProvas]        = useState<TodayProva[]>([]);
  const [provasLoading, setProvasLoading] = useState(true);
  const [monthly,       setMonthly]       = useState<MonthBar[]>([]);
  const [allOrders,     setAllOrders]     = useState<any[]>([]);
  const [refreshing,    setRefreshing]    = useState(false);
  const [hovered,       setHovered]       = useState<string | null>(null);

  const today          = todayStr();
  const overdueOrders  = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const readyCount     = orders.filter(o => o.status === 'teslimata_hazir').length;
  const inProdCount    = orders.filter(o => o.status === 'uretimde').length;

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
      const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const y = d.getFullYear(), m = d.getMonth();
        bars.push({ month: monthNames[m], count: data.filter(o => {
          const c = new Date(o.created_at);
          return c.getFullYear() === y && c.getMonth() === m;
        }).length });
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

  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={P} />}
      >

        {/* ── Compact Toolbar ── */}
        <View style={s.toolbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.toolbarSub}>{getTodayLabel().toUpperCase()}</Text>
            <Text style={s.toolbarTitle}>Hoş geldin, {firstName} 👋</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
            <MaterialCommunityIcons name="refresh" size={17} color={P} />
          </TouchableOpacity>
        </View>

        {/* ── Overdue Alert ── */}
        {overdueOrders.length > 0 && (
          <TouchableOpacity
            style={s.alertCard}
            onPress={() => router.push('/(lab)/all-orders' as any)}
            activeOpacity={0.8}
          >
            <View style={s.alertIconWrap}>
              <MaterialCommunityIcons name="clock-alert-outline" size={18} color={CLR.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>{overdueOrders.length} geciken iş var</Text>
              <Text style={s.alertSub}>Görüntülemek için tıklayın</Text>
            </View>
            <Feather name="chevron-right" size={16} color={CLR.red} />
          </TouchableOpacity>
        )}

        {/* ── KPI Cards ── */}
        <SectionLabel text="Bugün" />
        <View style={s.kpiRow}>
          <KpiCard
            icon="package-variant-closed"
            label="Bugün Teslim"
            value={orders.length}
            color={CLR.blue}
            bg={CLR.blueBg}
            delta={orders.length}
          />
          <KpiCard
            icon="check-circle-outline"
            label="Hazır"
            value={readyCount}
            color={CLR.green}
            bg={CLR.greenBg}
          />
          <KpiCard
            icon="cog-outline"
            label="Üretimde"
            value={inProdCount}
            color={CLR.orange}
            bg={CLR.orangeBg}
          />
          <KpiCard
            icon="clock-alert-outline"
            label="Geciken"
            value={overdueOrders.length}
            color={overdueOrders.length > 0 ? CLR.red : '#94A3B8'}
            bg={overdueOrders.length > 0 ? CLR.redBg : '#F8FAFC'}
            delta={overdueOrders.length > 0 ? -overdueOrders.length : undefined}
          />
        </View>

        {/* ── Charts ── */}
        <SectionLabel text="İş Akışı" />
        <View style={[s.chartsRow, isDesktop && s.chartsRowDesktop]}>
          {/* Monthly Trend */}
          <Card style={isDesktop ? { flex: 2 } : {}}>
            <CardHeader title="Aylık Trend" sub="Son 6 ay" />
            {monthly.length > 0
              ? <MonthlyChart data={monthly} />
              : <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>Yükleniyor...</Text>
                </View>
            }
          </Card>

          {/* Status Distribution */}
          <Card style={isDesktop ? { flex: 1 } : {}}>
            <CardHeader title="Statü Dağılımı" />
            <View style={{ padding: 20, gap: 12 }}>
              {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                const count = allOrders.filter(o => o.status === key).length;
                const total = allOrders.length || 1;
                const pct   = Math.round((count / total) * 100);
                return (
                  <View key={key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color, marginRight: 8 }} />
                      <Text style={{ flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' }}>{cfg.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{count}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ height: 4, borderRadius: 4, backgroundColor: cfg.color, width: `${pct}%` as any }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        {/* ── Today's Provas ── */}
        {(provas.length > 0 || provasLoading) && (
          <>
            <SectionLabel text="Bugünün Provaları" />
            <Card style={{ marginBottom: 20 }}>
              <CardHeader
                title="Provalar"
                right={
                  <View style={{ backgroundColor: P, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, minWidth: 26, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{provas.length}</Text>
                  </View>
                }
              />
              {provasLoading
                ? <Text style={s.loadingText}>Yükleniyor...</Text>
                : provas.map((p, idx) => {
                    const typeCfg = PROVA_TYPES.find(t => t.value === p.prova_type);
                    const isLast  = idx === provas.length - 1;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[s.tableRow, !isLast && s.tableRowBorder]}
                        onPress={() => p.work_order && router.push(`/(lab)/order/${p.work_order.id}` as any)}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: CLR.blueBg, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{typeCfg?.emoji ?? '🦷'}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.cellMain} numberOfLines={1}>
                            {p.work_order?.order_number ?? '—'}
                            {p.work_order?.patient_name ? ` · ${p.work_order.patient_name}` : ''}
                          </Text>
                          <Text style={s.cellSub} numberOfLines={1}>
                            {typeCfg?.label ?? 'Prova'} #{p.prova_number}
                            {p.order_item_name ? ` — ${p.order_item_name}` : ''}
                          </Text>
                        </View>
                        <StatusBadge status={p.status} />
                      </TouchableOpacity>
                    );
                  })
              }
            </Card>
          </>
        )}

        {/* ── Recent Orders ── */}
        <SectionLabel
          text="Son İşler"
          action="Tümünü Gör"
          onAction={() => router.push('/(lab)/all-orders' as any)}
        />
        <Card>
          {/* Table header */}
          <View style={s.tableHead}>
            <Text style={[s.thCell, { flex: 2 }]}>Sipariş No</Text>
            {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>}
            <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>
            <Text style={[s.thCell, { flex: 1.4 }]}>Statü</Text>
            {isDesktop && <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>Teslim</Text>}
          </View>

          {allOrders.length === 0
            ? <Text style={s.loadingText}>Yükleniyor...</Text>
            : allOrders.map((order, idx) => {
                const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                const isLast  = idx === allOrders.length - 1;
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[s.tableRow, !isLast && s.tableRowBorder, hovered === order.id && s.tableRowHover]}
                    onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                    activeOpacity={0.9}
                    // @ts-ignore
                    onMouseEnter={() => setHovered(order.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_CFG[order.status]?.color ?? '#94A3B8' }} />
                      <Text style={s.cellMain} numberOfLines={1}>{order.order_number}</Text>
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>
                        {(order.doctor as any)?.full_name ?? '—'}
                      </Text>
                    )}
                    <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>{order.work_type}</Text>
                    <View style={{ flex: 1.4 }}>
                      <StatusBadge status={order.status} />
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellDate, { flex: 0.8, textAlign: 'right' }, overdue && s.cellDateOverdue]}>
                        {fmtDate(order.delivery_date)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
          }
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingBottom: 40 },

  // Compact toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  toolbarSub:   { fontSize: 10, fontWeight: '600', color: '#94A3B8', letterSpacing: 1.0, marginBottom: 3 },
  toolbarTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F1F5F9',
  },

  // Overdue alert
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, gap: 12, marginBottom: 20,
    borderWidth: 1, borderColor: '#FCA5A5',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(239,68,68,0.06)',
  },
  alertIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: CLR.redBg, alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  alertSub:   { fontSize: 11, color: '#94A3B8' },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 24 },

  // Charts
  chartsRow:        { gap: 14, marginBottom: 20 },
  chartsRowDesktop: { flexDirection: 'row' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  thCell: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  tableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 10, minHeight: 52 },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  tableRowHover:  { backgroundColor: '#FAFBFD' },

  cellMain:         { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  cellSub:          { fontSize: 12, color: '#64748B' },
  cellDate:         { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  cellDateOverdue:  { color: CLR.red, fontWeight: '700' },

  loadingText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
});
