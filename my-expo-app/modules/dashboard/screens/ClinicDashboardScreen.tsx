import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { useClinicOrders } from '../../clinic/hooks/useClinicOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { BlurFade } from '../../../core/ui/BlurFade';

// ── Tokens ──────────────────────────────────────────────────────────
const P  = '#0369A1'; // clinic accent — deeper sky blue
const BG = '#F7F9FB';
const CLR = {
  green:  '#16A34A', greenBg:  '#DCFCE7',
  red:    '#EF4444', redBg:    '#FEE2E2',
  amber:  '#F59E0B', amberBg:  '#FEF3C7',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
  blue:   '#0EA5E9', blueBg:   '#E0F2FE',
};

// ── SVG Icons ────────────────────────────────────────────────────────
type IconName =
  | 'plus' | 'clock' | 'alert-triangle' | 'trending-up'
  | 'package' | 'calendar' | 'users' | 'activity' | 'check-circle' | 'layers';
function Icon({ name, size = 18, color = '#0F172A', strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'plus':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...p}/></Svg>;
    case 'clock':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="10" {...p}/><Polyline points="12 6 12 12 16 14" {...p}/></Svg>;
    case 'alert-triangle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p}/><Line x1="12" y1="9" x2="12" y2="13" {...p}/><Line x1="12" y1="17" x2="12.01" y2="17" {...p}/></Svg>;
    case 'trending-up':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...p}/><Polyline points="17 6 23 6 23 12" {...p}/></Svg>;
    case 'package':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" {...p}/><Polyline points="3.27 6.96 12 12.01 20.73 6.96" {...p}/><Line x1="12" y1="22.08" x2="12" y2="12" {...p}/></Svg>;
    case 'calendar':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 9h18M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" {...p}/><Polyline points="8 2 8 6" {...p}/><Polyline points="16 2 16 6" {...p}/></Svg>;
    case 'users':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...p}/><Circle cx="9" cy="7" r="4" {...p}/><Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...p}/></Svg>;
    case 'activity':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...p}/></Svg>;
    case 'check-circle':   return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" {...p}/><Polyline points="22 4 12 14.01 9 11.01" {...p}/></Svg>;
    case 'layers':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="12 2 2 7 12 12 22 7 12 2" {...p}/><Polyline points="2 17 12 22 22 17" {...p}/><Polyline points="2 12 12 17 22 12" {...p}/></Svg>;
    default: return null;
  }
}

function hexA(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

function getTodayLabel() {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function initials(name?: string | null) {
  if (!name) return '—';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '—';
}

// ── KPI Card ─────────────────────────────────────────────────────────
function KPICard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: IconName; accent: string;
}) {
  return (
    <View style={kpi.card}>
      <View style={[kpi.icon, { backgroundColor: hexA(accent, 0.10) }]}>
        <Icon name={icon} size={18} color={accent} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kpi.label} numberOfLines={1}>{label}</Text>
        <Text style={[kpi.value, { color: accent }]}>{value}</Text>
      </View>
    </View>
  );
}
const kpi = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  icon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, lineHeight: 26, marginTop: 2 },
});

// ── Card / CardHeader ────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[crd.wrap, style]}>{children}</View>;
}
function CardHeader({ title, right, icon }: { title: string; right?: React.ReactNode; icon?: IconName }) {
  return (
    <View style={crd.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={15} color="#94A3B8" strokeWidth={1.8} />}
        <Text style={crd.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}
const crd = StyleSheet.create({
  wrap:  { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
  header:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
});

// ── Section Title ────────────────────────────────────────────────────
function SectionTitle({ text }: { text: string }) {
  return <Text style={sec.text}>{text}</Text>;
}
const sec = StyleSheet.create({
  text: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 2 },
});

// ── Main Screen ──────────────────────────────────────────────────────
export function ClinicDashboardScreen() {
  const router  = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useClinicOrders();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 900;
  const isTablet  = width >= 600 && width < 900;

  const firstName  = profile?.full_name?.split(' ')[0] ?? '';
  const clinicName = profile?.clinic_name ?? 'Kliniğiniz';

  // ── Stats ──────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total       = orders.length;
  const activeCount = orders.filter(o => o.status !== 'teslim_edildi').length;
  const overdue     = orders.filter(o => isOrderOverdue(o.delivery_date, o.status)).length;
  const thisMonth   = orders.filter(o => {
    const d = new Date(o.created_at); d.setHours(0, 0, 0, 0);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  const thisWeek    = orders.filter(o => {
    const d = new Date(o.delivery_date + 'T00:00:00');
    const diff = (d.getTime() - today.getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7 && o.status !== 'teslim_edildi';
  }).length;
  const delivered   = orders.filter(o => o.status === 'teslim_edildi').length;

  // ── Hekim bazında dağılım ─────────────────────────────────────
  const byDoctor = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; active: number; overdue: number }>();
    for (const o of orders) {
      const docId   = o.doctor_id;
      const docName = (o as any).doctor_profile?.full_name ?? 'Bilinmeyen hekim';
      if (!map.has(docId)) map.set(docId, { id: docId, name: docName, total: 0, active: 0, overdue: 0 });
      const row = map.get(docId)!;
      row.total += 1;
      if (o.status !== 'teslim_edildi') row.active += 1;
      if (isOrderOverdue(o.delivery_date, o.status)) row.overdue += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [orders]);

  // ── Statü dağılımı ─────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const keys = ['alindi','uretimde','kalite_kontrol','teslimata_hazir','teslim_edildi'] as WorkOrderStatus[];
    return keys.map(k => ({
      key: k,
      label: STATUS_CONFIG[k].label,
      color: STATUS_CONFIG[k].color,
      count: orders.filter(o => o.status === k).length,
    }));
  }, [orders]);

  // ── Son 5 sipariş ──────────────────────────────────────────────
  const recent = useMemo(() =>
    orders.slice().sort((a, b) =>
      (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5),
    [orders]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
      >
        {/* Hero */}
        <View style={[s.heroRow, isDesktop && s.heroRowDesktop]}>
          <View style={[s.welcome, isDesktop && { flex: 1 }]}>
            <BlurFade duration={500} delay={0} yOffset={6}>
              <Text style={s.greeting}>Merhaba{firstName ? `, ${firstName}` : ''}</Text>
            </BlurFade>
            <BlurFade duration={500} delay={70} yOffset={6}>
              <Text style={s.clinicName}>{clinicName}</Text>
            </BlurFade>
            <BlurFade duration={500} delay={140} yOffset={6}>
              <Text style={s.date}>{getTodayLabel()}</Text>
            </BlurFade>
          </View>

          {overdue > 0 && (
            <View style={[s.alertCard, isDesktop && { width: 280 }]}>
              <View style={s.alertTop}><Text style={s.alertPill}>KRİTİK</Text></View>
              <Text style={s.alertTitle}>
                <Text style={s.alertCount}>{overdue}</Text>
                {' geciken sipariş'}
              </Text>
              <Text style={s.alertSub}>Klinik çapında acil müdahale gerekir.</Text>
              <TouchableOpacity
                style={s.alertBtn}
                onPress={() => router.push('/(clinic)/orders' as any)}
                activeOpacity={0.9}
              >
                <Text style={s.alertBtnText}>Detayları Gör</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* KPI Strip — mobile: wrap 2x3, tablet+: single row */}
        <View style={[s.kpiStrip, (isDesktop || isTablet) && { flexWrap: 'nowrap' }]}>
          <KPICard label="Toplam Sipariş" value={total}       icon="package"       accent={P} />
          <KPICard label="Aktif"           value={activeCount} icon="activity"      accent={CLR.blue} />
          <KPICard label="Geciken"         value={overdue}     icon="alert-triangle" accent={overdue > 0 ? CLR.red : '#94A3B8'} />
          <KPICard label="Bu Hafta"        value={thisWeek}    icon="calendar"      accent={CLR.amber} />
          <KPICard label="Bu Ay Yeni"      value={thisMonth}   icon="trending-up"   accent={CLR.green} />
          <KPICard label="Teslim Edilen"   value={delivered}   icon="check-circle"  accent="#64748B" />
        </View>

        {/* Main grid — responsive */}
        <View style={[s.grid, isDesktop && s.gridDesktop]}>

          {/* Col 1 — Hekim performansı */}
          <View style={[s.col, isDesktop && { flex: 1.2 }]}>
            <SectionTitle text="Hekim Performansı" />
            <Card>
              <CardHeader title="Hekim Bazında Siparişler" icon="users"
                right={
                  <TouchableOpacity onPress={() => router.push('/(clinic)/doctors' as any)}>
                    <Text style={s.linkBtn}>Hekimler →</Text>
                  </TouchableOpacity>
                }
              />
              {byDoctor.length === 0
                ? <Text style={s.emptyText}>Henüz hekim aktivitesi yok</Text>
                : byDoctor.map((d, i) => {
                    const isLast = i === byDoctor.length - 1;
                    return (
                      <View key={d.id} style={[docRow.row, !isLast && docRow.border]}>
                        <View style={[docRow.avatar, { backgroundColor: P }]}>
                          <Text style={docRow.avatarText}>{initials(d.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={docRow.name} numberOfLines={1}>{d.name}</Text>
                          <Text style={docRow.meta}>
                            {d.total} sipariş · {d.active} aktif
                            {d.overdue > 0 ? ` · ${d.overdue} gecikti` : ''}
                          </Text>
                        </View>
                        <View style={[docRow.countPill, { backgroundColor: hexA(P, 0.1) }]}>
                          <Text style={[docRow.countText, { color: P }]}>{d.total}</Text>
                        </View>
                      </View>
                    );
                  })
              }
            </Card>
          </View>

          {/* Col 2 — Statü dağılımı + son siparişler */}
          <View style={[s.col, isDesktop && { flex: 1 }]}>
            <SectionTitle text="Statü Dağılımı" />
            <Card>
              <CardHeader title="Durum" icon="layers" />
              <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 10 }}>
                {statusDist.map(item => {
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <View key={item.key}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color, marginRight: 8 }} />
                        <Text style={{ flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' }}>{item.label}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{item.count}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6, width: 32, textAlign: 'right' }}>{pct}%</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: 4, borderRadius: 4, backgroundColor: item.color, width: `${pct}%` as any }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>

            <View style={{ height: 20 }} />
            <SectionTitle text="Son Siparişler" />
            <Card>
              <CardHeader title="Son 5 Sipariş"
                right={
                  <TouchableOpacity onPress={() => router.push('/(clinic)/orders' as any)}>
                    <Text style={s.linkBtn}>Tümünü Gör →</Text>
                  </TouchableOpacity>
                }
              />
              {recent.length === 0
                ? <Text style={s.emptyText}>Henüz sipariş yok</Text>
                : recent.map((o, i) => {
                    const cfg = STATUS_CONFIG[o.status as WorkOrderStatus];
                    const overdueItem = isOrderOverdue(o.delivery_date, o.status);
                    const isLast = i === recent.length - 1;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        style={[rec.row, !isLast && rec.border]}
                        onPress={() => router.push(`/(clinic)/order/${o.id}` as any)}
                        activeOpacity={0.75}
                      >
                        <View style={[rec.dot, { backgroundColor: overdueItem ? CLR.red : cfg.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={rec.title} numberOfLines={1}>{o.work_type || 'Belirtilmemiş'}</Text>
                          <Text style={rec.sub} numberOfLines={1}>
                            {(o as any).doctor_profile?.full_name ?? '—'} · #{o.order_number}
                          </Text>
                        </View>
                        <Text style={[rec.date, overdueItem && { color: CLR.red, fontWeight: '700' }]}>
                          {new Date(o.delivery_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
              }
            </Card>
          </View>

        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* FAB — sadece mobilde */}
      {!isDesktop && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => router.push('/(clinic)/new-order' as any)}
          activeOpacity={0.85}
        >
          <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ── Doctor row ───────────────────────────────────────────────────────
const docRow = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 },
  border:      { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  avatar:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  name:        { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  meta:        { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  countPill:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText:   { fontSize: 12, fontWeight: '800' },
});

const rec = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dot:    { width: 7, height: 7, borderRadius: 4 },
  title:  { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  sub:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  date:   { fontSize: 11, fontWeight: '600', color: '#64748B' },
});

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 120, maxWidth: 1400, alignSelf: 'stretch' },

  /* Hero */
  heroRow:        { gap: 16, marginBottom: 20 },
  heroRowDesktop: { flexDirection: 'row' },
  welcome: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
  },
  greeting:   { fontSize: 14, color: '#64748B', fontWeight: '500' },
  clinicName: { fontSize: 26, fontWeight: '800', color: P, letterSpacing: -0.5, marginTop: 4 },
  date:       { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 6 },

  alertCard: {
    backgroundColor: '#FFF1F2', borderRadius: 16,
    padding: 18, gap: 6,
  },
  alertTop:  { alignItems: 'flex-start' },
  alertPill: { fontSize: 10, fontWeight: '800', color: CLR.red, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, letterSpacing: 0.8 },
  alertTitle:{ fontSize: 18, fontWeight: '800', color: '#7F1D1D', letterSpacing: -0.3, marginTop: 4 },
  alertCount:{ fontSize: 28, fontWeight: '900' },
  alertSub:  { fontSize: 12, color: '#B91C1C' },
  alertBtn:  { marginTop: 4, backgroundColor: CLR.red, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  alertBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  /* KPI */
  kpiStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },

  /* Grid */
  grid:        { gap: 20 },
  gridDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  col:         { gap: 0 },

  /* Links */
  linkBtn:   { fontSize: 12, color: P, fontWeight: '700' },
  emptyText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 20, bottom: 100,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: P,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(3,105,161,0.35)' } as any
      : { shadowColor: P, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }),
  },
});
