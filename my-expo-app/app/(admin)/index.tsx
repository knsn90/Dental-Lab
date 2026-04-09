import React, { useState, useCallback, useEffect } from 'react';
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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../lib/supabase';

// ─── Admin accent = siyah ─────────────────────────────────────────────────────
const P = '#0F172A';

const CLR = {
  blue:   '#007AFF',  blueBg:   '#EFF6FF',
  green:  '#34C759',  greenBg:  '#F0FFF4',
  orange: '#FF9500',  orangeBg: '#FFF8F0',
  red:    '#FF3B30',  redBg:    '#FFF1F0',
  purple: '#AF52DE',  purpleBg: '#F8F0FF',
  teal:   '#30B0C7',  tealBg:   '#E8FFFE',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#6C6C70', bg: '#F4F4F8' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: CLR.purple, bg: CLR.purpleBg },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#AEAEB2',  bg: '#F4F4F8' },
};

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const STATUS_KEYS = ['alindi','uretimde','kalite_kontrol','teslimata_hazir','teslim_edildi'];

function fmtDate(): string {
  const now = new Date();
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
}

function fmtDelivery(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6C6C70', bg: '#F4F4F8' };
  return (
    <View style={[bdg.w, { backgroundColor: c.bg }]}>
      <View style={[bdg.d, { backgroundColor: c.color }]} />
      <Text style={[bdg.t, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}
const bdg = StyleSheet.create({
  w: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 5 },
  d: { width: 6, height: 6, borderRadius: 3 },
  t: { fontSize: 11, fontWeight: '600' },
});

// ─── KpiCard — colored full card with white text ───────────────────────────────
function KpiCard({ icon, label, value, cardColor }: {
  icon: string; label: string; value: number; cardColor: string;
}) {
  return (
    <View style={[k.card, { backgroundColor: cardColor }]}>
      <View style={k.iconCircle}>
        <MaterialCommunityIcons name={icon as any} size={22} color="#FFFFFF" />
      </View>
      <Text style={k.value}>{value}</Text>
      <Text style={k.label}>{label}</Text>
    </View>
  );
}
const k = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 20,
    padding: 20,
    gap: 8,
    // @ts-ignore
    boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  label: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
});

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction} style={sh.btn}>
          <Text style={sh.action}>{action}</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={P} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 4 },
  title:  { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  btn:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: { fontSize: 13, color: P, fontWeight: '600' },
});

// ─── Chart Card wrapper ────────────────────────────────────────────────────────
function ChartCard({ children, title, sub, style }: { children: React.ReactNode; title: string; sub?: string; style?: any }) {
  return (
    <View style={[cc.card, style]}>
      <View style={cc.header}>
        <Text style={cc.title}>{title}</Text>
        {sub && <Text style={cc.sub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}
const cc = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EEF2FF' },
  title:  { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  sub:    { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});

// ─── VerticalBarChart ─────────────────────────────────────────────────────────
function VerticalBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 10, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12 }}>
      {data.map((item, i) => {
        const pct = Math.max((item.count / max) * 100, 4);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 }}>
              {item.count > 0 ? item.count : ''}
            </Text>
            <View style={{ width: '65%', height: '75%', justifyContent: 'flex-end', borderRadius: 8, backgroundColor: '#EEF2FF', overflow: 'hidden' }}>
              <View style={{ width: '100%', borderRadius: 8, backgroundColor: isLast ? color : `${color}60`, height: `${pct}%` as any }} />
            </View>
            <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 8, fontWeight: '600' }}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── HorizontalBarChart ───────────────────────────────────────────────────────
function HorizontalBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  const mx = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ gap: 14, paddingHorizontal: 20, paddingBottom: 20 }}>
      {data.map((item, i) => (
        <View key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: '#374151', flex: 1 }} numberOfLines={1}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E', marginLeft: 8 }}>{item.count}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: '#EEF2FF', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 4, backgroundColor: color, width: `${(item.count / mx) * 100}%` as any }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── QuickAction pill button ───────────────────────────────────────────────────
function QuickAction({
  icon, label, onPress, iconBg,
}: {
  icon: string; label: string; onPress: () => void; iconBg: string;
}) {
  return (
    <TouchableOpacity style={qa.btn} onPress={onPress} activeOpacity={0.7}>
      <View style={[qa.iconBox, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={26} color="#FFFFFF" />
      </View>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  btn:     { alignItems: 'center', gap: 8, width: 72 },
  iconBox: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 769;
  const isWide     = width >= 1100;
  const router     = useRouter();

  const [loading, setLoading]           = useState(true);
  const [totalOrders, setTotalOrders]   = useState(0);
  const [todayOrders, setTodayOrders]   = useState(0);
  const [overdueOrders, setOverdue]     = useState(0);
  const [totalDoctors, setDoctors]      = useState(0);
  const [totalLabUsers, setLabUsers]    = useState(0);
  const [byStatus, setByStatus]         = useState<{ label: string; count: number }[]>([]);
  const [byWorkType, setByWorkType]     = useState<{ label: string; count: number }[]>([]);
  const [byDoctor, setByDoctor]         = useState<{ label: string; count: number }[]>([]);
  const [monthly, setMonthly]           = useState<{ label: string; count: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [hovered, setHovered]           = useState<string | null>(null);

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
        supabase
          .from('profiles')
          .select('user_type')
          .neq('user_type', 'admin'),
        supabase
          .from('work_orders')
          .select('id, order_number, work_type, status, delivery_date, is_urgent, doctor:doctor_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const orders   = (ordersRes.data ?? []) as any[];
      const profiles = profilesRes.data ?? [];
      const recent   = (recentRes.data ?? []) as any[];

      let todayCount = 0, overdueCount = 0;
      const statusMap: Record<string, number> = {};
      const wtMap: Record<string, number>     = {};
      const docMap: Record<string, number>    = {};
      const monthMap: Record<string, number>  = {};

      // init month map
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = 0;
      }

      for (const o of orders) {
        if (o.created_at?.startsWith(today)) todayCount++;
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueCount++;
        statusMap[o.status] = (statusMap[o.status] ?? 0) + 1;
        if (o.work_type) wtMap[o.work_type] = (wtMap[o.work_type] ?? 0) + 1;
        const dn = (o.doctor as any)?.full_name;
        if (dn) docMap[dn] = (docMap[dn] ?? 0) + 1;
        if (o.created_at) {
          const d = new Date(o.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (key in monthMap) monthMap[key] += 1;
        }
      }

      setTotalOrders(orders.length);
      setTodayOrders(todayCount);
      setOverdue(overdueCount);
      setDoctors(profiles.filter((p: any) => p.user_type === 'doctor').length);
      setLabUsers(profiles.filter((p: any) => p.user_type === 'lab').length);

      setByStatus(
        STATUS_KEYS.map(k => ({ label: STATUS_CFG[k]?.label ?? k, count: statusMap[k] ?? 0 }))
      );
      setByWorkType(
        Object.entries(wtMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }))
      );
      setByDoctor(
        Object.entries(docMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }))
      );
      setMonthly(
        Object.entries(monthMap).map(([key, count]) => {
          const m = parseInt(key.split('-')[1]) - 1;
          return { label: MONTHS_TR[m], count };
        })
      );
      setRecentOrders(recent.map(o => ({
        id:            o.id,
        order_number:  o.order_number,
        work_type:     o.work_type,
        status:        o.status,
        delivery_date: o.delivery_date,
        is_urgent:     o.is_urgent ?? false,
        doctor_name:   (o.doctor as any)?.full_name ?? '—',
      })));
    } catch (e) {
      console.error('AdminDashboard loadStats error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Hero Banner */}
        <View style={s.heroBanner}>
          <View style={s.heroDeco1} />
          <View style={s.heroDeco2} />
          <View style={s.heroDeco3} />
          <View style={s.heroContent}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={s.heroGreet}>Hoş geldiniz 👋</Text>
              <Text style={s.heroDate}>{fmtDate()}</Text>
              {!loading && (
                <View style={s.heroStatRow}>
                  <View style={s.heroStatPill}>
                    <MaterialCommunityIcons name="clipboard-list-outline" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={s.heroStatText}>{totalOrders} sipariş</Text>
                  </View>
                  {overdueOrders > 0 ? (
                    <View style={[s.heroStatPill, s.heroStatPillAlert]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#FCA5A5" />
                      <Text style={[s.heroStatText, { color: '#FCA5A5' }]}>{overdueOrders} geciken</Text>
                    </View>
                  ) : (
                    <View style={[s.heroStatPill, s.heroStatPillOk]}>
                      <MaterialCommunityIcons name="check-circle-outline" size={13} color="#6EE7B7" />
                      <Text style={[s.heroStatText, { color: '#6EE7B7' }]}>Geciken yok</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            <TouchableOpacity style={s.refreshBtn} onPress={loadStats} activeOpacity={0.7}>
              <MaterialCommunityIcons name="refresh" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color="#2563EB" size="large" />
          </View>
        ) : (
          <>
            {/* Overdue Alert */}
            {overdueOrders > 0 && (
              <TouchableOpacity
                style={s.alertCard}
                onPress={() => router.push('/(admin)/orders' as any)}
                activeOpacity={0.7}
              >
                <View style={s.alertIcon}>
                  <MaterialCommunityIcons name="alert-circle" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alertTitle}>{overdueOrders} geciken sipariş</Text>
                  <Text style={s.alertSub}>Teslim tarihi geçmiş siparişler mevcut</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Quick Actions */}
            <SectionHeader title="Hızlı İşlemler" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.quickActionsRow}
              style={{ marginBottom: 24 }}
            >
              <QuickAction icon="plus-circle-outline"    label="Yeni İş"      iconBg="#2563EB" onPress={() => router.push('/(admin)/new-order' as any)} />
              <QuickAction icon="account-group-outline"  label="Kullanıcılar" iconBg="#7C3AED" onPress={() => router.push('/(admin)/users' as any)} />
              <QuickAction icon="stethoscope"            label="Hekimler"     iconBg="#0891B2" onPress={() => router.push('/(admin)/doctors' as any)} />
              <QuickAction icon="clipboard-list-outline" label="Siparişler"   iconBg="#EA580C" onPress={() => router.push('/(admin)/orders' as any)} />
              <QuickAction icon="cog-outline"            label="Profil"       iconBg="#475569" onPress={() => router.push('/(admin)/profile' as any)} />
            </ScrollView>

            {/* KPI */}
            <SectionHeader title="Genel Bakış" />
            <View style={s.kpiRow}>
              <KpiCard
                icon="clipboard-list-outline"
                label="Toplam Sipariş"
                value={totalOrders}
                cardColor="#1E3A8A"
              />
              <KpiCard
                icon="calendar-today"
                label="Bugün Eklenen"
                value={todayOrders}
                cardColor="#2563EB"
              />
              <KpiCard
                icon="alert-circle-outline"
                label="Geciken"
                value={overdueOrders}
                cardColor={overdueOrders > 0 ? '#DC2626' : '#059669'}
              />
              <KpiCard
                icon="stethoscope"
                label="Kayıtlı Hekim"
                value={totalDoctors}
                cardColor="#7C3AED"
              />
              {isWide && (
                <KpiCard
                  icon="account-multiple-outline"
                  label="Lab Kullanıcısı"
                  value={totalLabUsers}
                  cardColor="#0891B2"
                />
              )}
            </View>

            {/* Charts Row 1 */}
            <SectionHeader title="Sipariş Trendi" />
            <View style={[s.chartsRow, !isDesktop && s.chartsCol]}>
              <ChartCard title="Son 6 Ay" sub="Aylık sipariş sayısı" style={isDesktop ? { flex: 2 } : {}}>
                <VerticalBarChart data={monthly} color="#2563EB" />
              </ChartCard>
              <ChartCard title="Statü Dağılımı" style={isDesktop ? { flex: 1 } : {}}>
                <View style={{ paddingTop: 12 }}>
                  <HorizontalBarChart data={byStatus} color="#1E3A8A" />
                </View>
              </ChartCard>
            </View>

            {/* Charts Row 2 */}
            {(byWorkType.length > 0 || byDoctor.length > 0) && (
              <>
                <SectionHeader title="Detay Analiz" />
                <View style={[s.chartsRow, !isDesktop && s.chartsCol]}>
                  {byWorkType.length > 0 && (
                    <ChartCard title="İş Tipi Dağılımı" style={isDesktop ? { flex: 1 } : {}}>
                      <View style={{ paddingTop: 12 }}>
                        <HorizontalBarChart data={byWorkType} color="#EA580C" />
                      </View>
                    </ChartCard>
                  )}
                  {byDoctor.length > 0 && (
                    <ChartCard title="Hekim Bazlı" style={isDesktop ? { flex: 1 } : {}}>
                      <View style={{ paddingTop: 12 }}>
                        <HorizontalBarChart data={byDoctor} color="#0891B2" />
                      </View>
                    </ChartCard>
                  )}
                </View>
              </>
            )}

            {/* Recent Orders */}
            <SectionHeader
              title="Son Siparişler"
              action="Tümünü Gör"
              onAction={() => router.push('/(admin)/orders' as any)}
            />
            <View style={s.recentCard}>
              <View style={s.tableHead}>
                <Text style={[s.thCell, { flex: 2 }]}>Sipariş</Text>
                {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>}
                <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>
                <Text style={[s.thCell, { flex: 1.2 }]}>Statü</Text>
                <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>Teslim</Text>
              </View>

              {recentOrders.length === 0 ? (
                <Text style={s.emptyText}>Henüz sipariş yok</Text>
              ) : recentOrders.map((order, idx) => {
                const overdue = order.delivery_date < new Date().toISOString().split('T')[0] && order.status !== 'teslim_edildi';
                const isLast  = idx === recentOrders.length - 1;
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[s.tableRow, !isLast && s.tableRowBorder, hovered === order.id && s.tableRowHover]}
                    onPress={() => router.push(`/(admin)/order/${order.id}` as any)}
                    activeOpacity={0.7}
                    // @ts-ignore
                    onMouseEnter={() => setHovered(order.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[s.dot, { backgroundColor: STATUS_CFG[order.status]?.color ?? '#AEAEB2' }]} />
                      <View>
                        <Text style={s.orderNo} numberOfLines={1}>{order.order_number}</Text>
                        {order.is_urgent && <Text style={s.urgentTag}>ACİL</Text>}
                      </View>
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellText, { flex: 2 }]} numberOfLines={1}>{order.doctor_name}</Text>
                    )}
                    <Text style={[s.cellText, { flex: 2 }]} numberOfLines={1}>{order.work_type || '—'}</Text>
                    <View style={{ flex: 1.2 }}>
                      <StatusBadge status={order.status} />
                    </View>
                    <Text style={[s.cellDate, { flex: 0.8, textAlign: 'right' }, overdue && s.cellDateOver]}>
                      {fmtDelivery(order.delivery_date)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 24, paddingBottom: 60 },

  /* ── Hero Banner ── */
  heroBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
    overflow: 'hidden',
    minHeight: 140,
    // @ts-ignore
    boxShadow: '0 8px 32px rgba(15,23,42,0.20)',
  },
  heroDeco1: {
    position: 'absolute', right: -40, top: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDeco2: {
    position: 'absolute', right: 60, bottom: -50,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  heroDeco3: {
    position: 'absolute', left: -20, bottom: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  heroContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroGreet:   { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  heroDate:    { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.8 },
  heroStatRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  heroStatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroStatPillAlert: { backgroundColor: 'rgba(220,38,38,0.25)' },
  heroStatPillOk:    { backgroundColor: 'rgba(5,150,105,0.2)' },
  heroStatText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  refreshBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  loadingBox: { alignItems: 'center', paddingVertical: 80 },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  alertIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  alertSub:   { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  quickActionsRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 2, paddingVertical: 4 },

  kpiRow:    { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  chartsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  chartsCol: { flexDirection: 'column' },

  recentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2FF',
    backgroundColor: '#F8FAFF',
  },
  thCell: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },

  tableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#EEF2FF' },
  tableRowHover:  { backgroundColor: '#F8FAFF' },

  dot:          { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  orderNo:      { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  urgentTag:    { fontSize: 9, fontWeight: '800', color: '#DC2626', backgroundColor: '#FFF1F0', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  cellText:     { fontSize: 13, color: '#6C6C70' },
  cellDate:     { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  cellDateOver: { color: '#DC2626', fontWeight: '700' },
  emptyText:    { padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 },
});
