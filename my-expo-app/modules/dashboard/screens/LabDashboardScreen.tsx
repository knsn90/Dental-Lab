import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuthStore } from '../../../core/store/authStore';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { supabase } from '../../../core/api/supabase';
import { BlurFade } from '../../../core/ui/BlurFade';

const P  = '#2563EB';
const BG = '#F7F9FB';

const CLR = {
  blue:   '#2563EB', blueBg:   '#EFF6FF',
  green:  '#16A34A', greenBg:  '#DCFCE7',
  orange: '#D97706', orangeBg: '#FEF3C7',
  red:    '#EF4444', redBg:    '#FEF2F2',
};

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

function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function getTodayLabel() {
  const d = new Date();
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}
function initials(name?: string | null) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '—';
}

// ── Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bg, gap: 4, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ── Quick Action Card ─────────────────────────────────────────────────
function QuickAction({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={qa.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[qa.iconCircle, primary && qa.iconCirclePrimary]}>
        <Feather name={icon as any} size={22} color={primary ? '#FFFFFF' : P} />
      </View>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  card: {
    flex: 1, minWidth: 120,
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: CLR.blueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCirclePrimary: { backgroundColor: P },
  label: { fontSize: 12, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
});

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({ label, value, accent, delta, accentBar }: {
  label: string; value: number | string; accent?: string; delta?: string; accentBar?: boolean;
}) {
  return (
    <View style={sc.card}>
      {accentBar && <View style={sc.accentBar} />}
      <Text style={sc.label}>{label}</Text>
      <View style={sc.valueRow}>
        <Text style={[sc.value, accent ? { color: accent } : null]}>{value}</Text>
        {delta && (
          <View style={sc.delta}>
            <Feather name="arrow-up" size={10} color={P} />
            <Text style={sc.deltaText}>{delta}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 150,
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 18,
    borderWidth: 1, borderColor: '#F1F5F9',
    position: 'relative', overflow: 'hidden',
  },
  accentBar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, backgroundColor: P },
  label: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginBottom: 10 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  value: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, lineHeight: 32 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: CLR.blueBg, marginBottom: 4 },
  deltaText: { fontSize: 10, fontWeight: '700', color: P },
});

// ── Card wrap ─────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}
function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={card.header}>
      <Text style={card.title}>{title}</Text>
      {right}
    </View>
  );
}
const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
});

// ── Section Title ─────────────────────────────────────────────────────
function SectionTitle({ text }: { text: string }) {
  return <Text style={sec.text}>{text}</Text>;
}
const sec = StyleSheet.create({
  text: {
    fontSize: 11, fontWeight: '700', color: '#64748B',
    letterSpacing: 1.0, textTransform: 'uppercase',
    marginBottom: 12, marginTop: 4, paddingHorizontal: 2,
  },
});

// ── Monthly Chart ─────────────────────────────────────────────────────
function MonthlyChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 10, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 }}>
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 6);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            {d.count > 0 && (
              <Text style={{ fontSize: 10, fontWeight: '700', color: isLast ? P : '#94A3B8', marginBottom: 6 }}>
                {d.count}
              </Text>
            )}
            <View style={{ width: '100%', height: '78%', justifyContent: 'flex-end', borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ width: '100%', borderRadius: 8, height: `${pct}%` as any,
                backgroundColor: isLast ? P : `${P}25` }} />
            </View>
            <Text style={{ fontSize: 10, color: isLast ? P : '#94A3B8', marginTop: 8, fontWeight: isLast ? '700' : '500' }}>
              {d.month}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────
export function LabDashboardScreen() {
  const router  = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [provas,        setProvas]        = useState<TodayProva[]>([]);
  const [provasLoading, setProvasLoading] = useState(true);
  const [monthly,       setMonthly]       = useState<MonthBar[]>([]);
  const [allOrders,     setAllOrders]     = useState<any[]>([]);
  const [totalOrders,   setTotalOrders]   = useState(0);
  const [todayNewCount, setTodayNewCount] = useState(0);
  const [doctorCount,   setDoctorCount]   = useState(0);
  const [userCount,     setUserCount]     = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);
  const [hovered,       setHovered]       = useState<string | null>(null);

  const today          = todayStr();
  const overdueOrders  = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));

  const loadExtra = async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      setAllOrders(data.slice(0, 6));
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

    const { count: totalCount }    = await supabase.from('work_orders').select('id', { count: 'exact', head: true });
    const { count: todayCount }    = await supabase.from('work_orders').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`);
    const { count: drCount }       = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('user_type', 'doctor');
    const { count: labUserCount }  = await supabase.from('profiles').select('id', { count: 'exact', head: true }).in('user_type', ['lab_user', 'mesul_mudur']);
    setTotalOrders(totalCount ?? 0);
    setTodayNewCount(todayCount ?? 0);
    setDoctorCount(drCount ?? 0);
    setUserCount(labUserCount ?? 0);
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

        {/* ── Hero Welcome + Critical Alert ────────────────────── */}
        <View style={[s.heroRow, isDesktop && s.heroRowDesktop]}>
          <View style={[s.welcomeCard, isDesktop && { flex: 1 }]}>
            <BlurFade duration={600} delay={0} yOffset={8}>
              <Text style={s.welcomeGreet}>Hoş geldin{firstName ? `, ${firstName}` : ''},</Text>
            </BlurFade>
            <BlurFade duration={600} delay={80} yOffset={8}>
              <Text style={s.welcomeDate}>{getTodayLabel()}</Text>
            </BlurFade>
            <BlurFade duration={600} delay={160} yOffset={8}>
              <Text style={s.welcomeSub}>Laboratuvar portalına hoş geldin. Günlük özetin hazır.</Text>
            </BlurFade>
          </View>

          {overdueOrders.length > 0 && (
            <View style={[s.alertCard, isDesktop && { width: 300 }]}>
              <Feather
                name="alert-triangle"
                size={180}
                color={CLR.red}
                style={s.alertDecorIcon}
              />
              <View style={s.alertTop}>
                <Text style={s.alertPill}>KRİTİK</Text>
              </View>
              <Text style={s.alertTitle}>
                <Text style={s.alertCount}>{overdueOrders.length}</Text>
                {' geciken sipariş'}
              </Text>
              <Text style={s.alertSub}>Acil müdahale gerektiren vakalar.</Text>
              <TouchableOpacity
                style={s.alertBtn}
                onPress={() => router.push('/(lab)/all-orders' as any)}
                activeOpacity={0.9}
              >
                <Text style={s.alertBtnText}>Detayları Gör</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <SectionTitle text="Hızlı İşlemler" />
        <View style={s.quickRow}>
          <QuickAction icon="plus"       label="Yeni İş"      primary onPress={() => router.push('/(lab)/new-order' as any)} />
          <QuickAction icon="users"      label="Kullanıcılar"       onPress={() => router.push('/(lab)/approvals' as any)} />
          <QuickAction icon="user"       label="Hekimler"             onPress={() => router.push('/(lab)/clinics' as any)} />
          <QuickAction icon="file-text"  label="Siparişler"           onPress={() => router.push('/(lab)/all-orders' as any)} />
          <QuickAction icon="user"       label="Profil"          onPress={() => router.push('/(lab)/profile' as any)} />
        </View>

        {/* ── Genel Bakış + Sağ Kolon ───────────────────────────── */}
        <View style={[s.mainGrid, isDesktop && s.mainGridDesktop]}>

          {/* Left — 2/3 */}
          <View style={[{ gap: 20 }, isDesktop && { flex: 2 }]}>
            <SectionTitle text="Genel Bakış" />
            <View style={s.statsGrid}>
              <StatCard label="Toplam Sipariş" value={totalOrders.toLocaleString('tr-TR')} delta={totalOrders > 0 ? '+12%' : undefined} />
              <StatCard label="Bugün Yeni"    value={todayNewCount} accent={P} accentBar />
              <StatCard label="Geciken"       value={overdueOrders.length} accent={overdueOrders.length > 0 ? CLR.red : undefined} />
              <StatCard label="Bugün Teslim"  value={orders.length} />
              <StatCard label="Kayıtlı Hekim" value={doctorCount} />
              <StatCard label="Lab Kullanıcısı" value={userCount} />
            </View>

            {/* Aylık Trend */}
            <Card>
              <CardHeader
                title="Sipariş Trendi"
                right={<View style={s.chip}><Text style={s.chipText}>Son 6 Ay</Text></View>}
              />
              {monthly.length > 0
                ? <MonthlyChart data={monthly} />
                : <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 13 }}>Yükleniyor...</Text>
                  </View>
              }
            </Card>
          </View>

          {/* Right — 1/3 */}
          <View style={[{ gap: 20 }, isDesktop && { flex: 1 }]}>
            <SectionTitle text="Analiz" />

            {/* Statü Dağılımı */}
            <Card>
              <CardHeader title="Statü Dağılımı" />
              <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
                {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                  const count = allOrders.filter(o => o.status === key).length;
                  const total = allOrders.length || 1;
                  const pct   = Math.round((count / total) * 100);
                  return (
                    <View key={key}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' }}>{cfg.label}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{count}</Text>
                      </View>
                      <View style={{ height: 5, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: 5, borderRadius: 4, backgroundColor: cfg.color, width: `${pct}%` as any }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* Bugünün Provaları */}
            {(provas.length > 0 || provasLoading) && (
              <Card>
                <CardHeader
                  title="Bugünün Provaları"
                  right={
                    <View style={s.countChip}>
                      <Text style={s.countChipText}>{provas.length}</Text>
                    </View>
                  }
                />
                {provasLoading
                  ? <Text style={s.loadingText}>Yükleniyor...</Text>
                  : provas.slice(0, 5).map((p, idx) => {
                      const typeCfg = PROVA_TYPES.find(t => t.value === p.prova_type);
                      const isLast  = idx === Math.min(provas.length, 5) - 1;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[s.provaRow, !isLast && s.rowBorder]}
                          onPress={() => p.work_order && router.push(`/(lab)/order/${p.work_order.id}` as any)}
                          activeOpacity={0.7}
                        >
                          <View style={s.provaEmoji}>
                            <Text style={{ fontSize: 16 }}>{typeCfg?.emoji ?? '🦷'}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={s.cellMain} numberOfLines={1}>
                              {p.work_order?.order_number ?? '—'}
                            </Text>
                            <Text style={s.cellSub} numberOfLines={1}>
                              {typeCfg?.label ?? 'Prova'} #{p.prova_number}
                            </Text>
                          </View>
                          <StatusBadge status={p.status} />
                        </TouchableOpacity>
                      );
                    })
                }
              </Card>
            )}
          </View>
        </View>

        {/* ── Son Siparişler ────────────────────────────────────── */}
        <View style={{ marginTop: 20 }}>
          <Card>
            <CardHeader
              title="Son Siparişler"
              right={
                <TouchableOpacity onPress={() => router.push('/(lab)/all-orders' as any)}>
                  <Text style={s.linkBtn}>Tümünü Gör</Text>
                </TouchableOpacity>
              }
            />
            <View style={s.tableHead}>
              <Text style={[s.thCell, { flex: 1.2 }]}>Sipariş No</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>
              {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>}
              <Text style={[s.thCell, { flex: 1.4 }]}>Statü</Text>
              {isDesktop && <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Teslim</Text>}
            </View>

            {allOrders.length === 0
              ? <Text style={s.loadingText}>Yükleniyor...</Text>
              : allOrders.map((order, idx) => {
                  const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                  const isLast  = idx === allOrders.length - 1;
                  const drName  = (order.doctor as any)?.full_name ?? '—';
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={[s.tableRow, !isLast && s.rowBorder, overdue && s.tableRowOverdue, hovered === order.id && s.tableRowHover]}
                      onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                      activeOpacity={0.9}
                      // @ts-ignore
                      onMouseEnter={() => setHovered(order.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <Text style={[s.orderNo, { flex: 1.2 }]} numberOfLines={1}>#{order.order_number}</Text>
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>{initials(drName)}</Text>
                        </View>
                        <Text style={s.cellMain} numberOfLines={1}>{drName}</Text>
                      </View>
                      {isDesktop && (
                        <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>{order.work_type}</Text>
                      )}
                      <View style={{ flex: 1.4 }}>
                        <StatusBadge status={order.status} />
                      </View>
                      {isDesktop && (
                        <Text style={[s.cellDate, { flex: 1, textAlign: 'right' }, overdue && s.cellDateOverdue]}>
                          {fmtDate(order.delivery_date)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })
            }
          </Card>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingBottom: 40, maxWidth: 1400, alignSelf: 'stretch' },

  // Hero
  heroRow:        { gap: 16, marginBottom: 24 },
  heroRowDesktop: { flexDirection: 'row' },

  welcomeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 28,
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  welcomeGreet: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  welcomeDate:  { fontSize: 28, fontWeight: '300', color: P, letterSpacing: -0.5, marginTop: 2 },
  welcomeSub:   { fontSize: 13, color: '#64748B', marginTop: 10 },

  // Critical alert
  alertCard: {
    backgroundColor: '#FFF1F2', borderRadius: 16,
    padding: 20, gap: 8,
    position: 'relative', overflow: 'hidden',
  },
  alertDecorIcon: {
    position: 'absolute', top: -30, left: -30, opacity: 0.1,
  } as any,
  alertTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end' },
  alertPill: {
    fontSize: 10, fontWeight: '800', color: CLR.red,
    backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, letterSpacing: 0.8,
  },
  alertTitle: { fontSize: 20, fontWeight: '800', color: '#7F1D1D', marginTop: 6, letterSpacing: -0.4 },
  alertCount: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  alertSub:   { fontSize: 12, color: '#B91C1C' },
  alertBtn: {
    marginTop: 6, backgroundColor: CLR.red, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  alertBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 24 },

  // Main grid
  mainGrid:        { gap: 20 },
  mainGridDesktop: { flexDirection: 'row' },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Chips
  chip:      { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:  { fontSize: 11, color: '#64748B', fontWeight: '600' },

  countChip:     { backgroundColor: P, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, minWidth: 26, alignItems: 'center' },
  countChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  linkBtn: { fontSize: 13, color: P, fontWeight: '700' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  thCell: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 10, minHeight: 56 },
  tableRowHover:   { backgroundColor: '#FAFBFD' },
  tableRowOverdue: { backgroundColor: '#FEF2F2' },
  rowBorder:       { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  provaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  provaEmoji: { width: 36, height: 36, borderRadius: 10, backgroundColor: CLR.blueBg, alignItems: 'center', justifyContent: 'center' },

  orderNo:   { fontSize: 12, fontWeight: '700', color: P },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#64748B' },

  cellMain:         { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  cellSub:          { fontSize: 12, color: '#64748B' },
  cellDate:         { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  cellDateOverdue:  { color: CLR.red, fontWeight: '700' },

  loadingText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
});
