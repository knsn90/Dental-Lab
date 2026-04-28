import React, { useState } from 'react';
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

import { AppIcon } from '../../core/ui/AppIcon';

// ─── Admin accent (black) ─────────────────────────────────────────────────────
const P = '#0F172A';

// ─── iOS System Colors ────────────────────────────────────────────────────────
const CLR = {
  blue:     '#007AFF',  blueBg:   '#EFF6FF',
  green:    '#34C759',  greenBg:  '#F0FFF4',
  orange:   '#FF9500',  orangeBg: '#FFF8F0',
  red:      '#FF3B30',  redBg:    '#FFF1F0',
  purple:   '#AF52DE',  purpleBg: '#F8F0FF',
  indigo:   '#5856D6',  indigoBg: '#F0EFFE',
  teal:     '#30B0C7',  tealBg:   '#E8FFFE',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#6C6C70', bg: '#F4F4F8' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange,  bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: CLR.purple,  bg: CLR.purpleBg },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,   bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#AEAEB2',   bg: '#F4F4F8' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function isOverdue(date: string, status: string) {
  if (status === 'teslim_edildi') return false;
  return new Date(date) < new Date();
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

// ─── KpiCard — Overpay style ─────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, bgColor, trend }: {
  icon: string; label: string; value: number | string; color: string; bgColor: string; trend?: string;
}) {
  return (
    <View style={k.card}>
      <View style={k.top}>
        <View style={[k.iconBox, { backgroundColor: bgColor }]}>
          <AppIcon name={icon as any} size={20} color={color} />
        </View>
        {trend && (
          <View style={[k.trendPill, { backgroundColor: trend.startsWith('+') ? CLR.greenBg : CLR.redBg }]}>
            <AppIcon
              name={trend.startsWith('+') ? 'trending-up' : 'trending-down'}
              size={12}
              color={trend.startsWith('+') ? CLR.green : CLR.red}
            />
            <Text style={[k.trendText, { color: trend.startsWith('+') ? CLR.green : CLR.red }]}>{trend}</Text>
          </View>
        )}
      </View>
      <Text style={k.value}>{value}</Text>
      <Text style={k.label}>{label}</Text>
    </View>
  );
}
const k = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  trendText: { fontSize: 11, fontWeight: '700' },
  value: { fontSize: 28, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5, marginBottom: 2 },
  label: { fontSize: 13, fontWeight: '500', color: '#6C6C70' },
});

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction} style={sh.actionBtn}>
          <Text style={sh.action}>{action}</Text>
          <AppIcon name="chevron-right" size={14} color={CLR.blue} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  title: { fontSize: 11, fontWeight: '700', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: { fontSize: 13, color: CLR.blue, fontWeight: '600' },
});

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[cd.wrap, style]}>{children}</View>;
}
function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={cd.header}>
      <View style={{ flex: 1 }}>
        <Text style={cd.title}>{title}</Text>
        {sub && <Text style={cd.sub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}
const cd = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  sub:   { fontSize: 12, color: '#AEAEB2', marginTop: 2 },
});

// ─── VerticalBarChart — Overpay style ─────────────────────────────────────────
function VerticalBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  const items = data.slice(0, 6);
  const max = Math.max(...items.map(d => d.count), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 10, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12 }}>
      {items.map((item, i) => {
        const pct = Math.max((item.count / max) * 100, 4);
        const isLast = i === items.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 }}>
              {item.count > 0 ? item.count : ''}
            </Text>
            <View style={{
              width: '70%',
              height: '75%',
              justifyContent: 'flex-end',
              borderRadius: 10,
              backgroundColor: '#F8FAFC',
              overflow: 'hidden',
            }}>
              <View style={{
                width: '100%',
                borderRadius: 10,
                backgroundColor: isLast ? color : `${color}40`,
                height: `${pct}%` as any,
              }} />
            </View>
            <Text style={{ fontSize: 10, color: '#AEAEB2', marginTop: 8, fontWeight: '600' }}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── HorizontalBarChart ───────────────────────────────────────────────────────
function HorizontalBarChart({ data, color, max: maxItems = 6 }: { data: { label: string; count: number }[]; color: string; max?: number }) {
  const items = data.slice(0, maxItems);
  const mx = Math.max(...items.map(d => d.count), 1);
  return (
    <View style={{ gap: 14, paddingHorizontal: 20, paddingBottom: 20 }}>
      {items.map((item, i) => (
        <View key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: '#6C6C70', flex: 1 }} numberOfLines={1}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E', marginLeft: 8 }}>{item.count}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: '#F8FAFC', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: `${(item.count / mx) * 100}%` as any }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── QuickAction Button ───────────────────────────────────────────────────────
function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={qa.btn} onPress={onPress} activeOpacity={0.7}>
      <View style={qa.iconWrap}>
        <AppIcon name={icon as any} size={22} color={P} />
      </View>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  btn: { alignItems: 'center', gap: 8, flex: 1 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  label: { fontSize: 11, fontWeight: '600', color: '#6C6C70', textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 769;
  const isWide     = width >= 1100;
  const router     = useRouter();
  const { stats, loading, refresh } = useAdminDashboard();
  const [hovered, setHovered] = useState<string | null>(null);

  const statusChartData = stats
    ? Object.entries(stats.byStatus).map(([key, count]) => ({
        label: STATUS_CFG[key]?.label ?? key,
        count,
      }))
    : [];

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Page Header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.dateText}>{fmtDate()}</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={refresh} activeOpacity={0.7}>
            <AppIcon name="refresh" size={16} color={P} />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={P} size="large" />
          </View>
        )}

        {!loading && stats && (
          <>
            {/* ── Overdue Alert ── */}
            {stats.overdueOrders > 0 && (
              <TouchableOpacity
                style={s.alertCard}
                onPress={() => router.push('/admin/orders' as any)}
                activeOpacity={0.7}
              >
                <View style={s.alertIcon}>
                  <AppIcon name="alert-circle" size={20} color={CLR.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alertTitle}>{stats.overdueOrders} geciken sipariş</Text>
                  <Text style={s.alertSub}>Teslim tarihi geçmiş siparişler mevcut</Text>
                </View>
                <AppIcon name="chevron-right" size={18} color="#AEAEB2" />
              </TouchableOpacity>
            )}

            {/* ── Quick Actions — like Overpay's Quick Links ── */}
            <Card style={{ marginBottom: 20 }}>
              <CardHeader title="Hızlı İşlemler" />
              <View style={{ flexDirection: 'row', paddingVertical: 20, paddingHorizontal: 16 }}>
                <QuickAction icon="plus-circle-outline" label="Yeni Sipariş" onPress={() => router.push('/admin/orders' as any)} />
                <QuickAction icon="account-group-outline" label="Kullanıcılar" onPress={() => router.push('/admin/users' as any)} />
                <QuickAction icon="chart-bar" label="Raporlar" onPress={() => router.push('/admin/reports' as any)} />
                <QuickAction icon="diamond-outline" label="Materyaller" onPress={() => router.push('/admin/materials' as any)} />
                <QuickAction icon="cog-outline" label="Ayarlar" onPress={() => router.push('/admin/settings' as any)} />
              </View>
            </Card>

            {/* ── KPI Section ── */}
            <SectionHeader title="Genel Bakış" />
            <View style={s.kpiRow}>
              <KpiCard icon="clipboard-list-outline" label="Toplam Sipariş"  value={stats.totalOrders}   color={CLR.indigo}  bgColor={CLR.indigoBg} />
              <KpiCard icon="calendar-today"         label="Bugün Eklenen"   value={stats.todayOrders}   color={CLR.blue}    bgColor={CLR.blueBg}   />
              <KpiCard icon="alert-circle-outline"   label="Geciken"         value={stats.overdueOrders} color={CLR.red}     bgColor={CLR.redBg}    />
              <KpiCard icon="stethoscope"            label="Kayıtlı Hekim"   value={stats.totalDoctors}  color={CLR.green}   bgColor={CLR.greenBg}  />
              {isWide && (
                <KpiCard icon="account-multiple-outline" label="Lab Kullanıcısı" value={stats.totalLabUsers} color={CLR.orange}  bgColor={CLR.orangeBg} />
              )}
            </View>

            {/* ── Charts Row ── */}
            <SectionHeader title="Sipariş Trendi" />
            <View style={[s.chartsRow, !isDesktop && s.chartsCol]}>
              <Card style={isDesktop ? { flex: 2 } : {}}>
                <CardHeader title="Son 6 Ay" sub="Aylık sipariş sayısı" />
                <VerticalBarChart data={stats.monthly.map(m => ({ label: m.month, count: m.count }))} color={CLR.indigo} />
              </Card>
              <Card style={isDesktop ? { flex: 1 } : {}}>
                <CardHeader title="Statü Dağılımı" />
                <View style={{ paddingTop: 12 }}>
                  <HorizontalBarChart data={statusChartData} color={P} max={5} />
                </View>
              </Card>
            </View>

            {/* ── Charts Row 2 ── */}
            <SectionHeader title="Detay Analiz" />
            <View style={[s.chartsRow, !isDesktop && s.chartsCol]}>
              <Card style={isDesktop ? { flex: 1 } : {}}>
                <CardHeader title="İş Tipi Dağılımı" />
                <View style={{ paddingTop: 12 }}>
                  <HorizontalBarChart data={stats.byWorkType} color={CLR.orange} max={8} />
                </View>
              </Card>
              <Card style={isDesktop ? { flex: 1 } : {}}>
                <CardHeader title="Hekim Bazlı Siparişler" />
                <View style={{ paddingTop: 12 }}>
                  <HorizontalBarChart data={stats.byDoctor.map(d => ({ label: d.name, count: d.count }))} color={CLR.teal} max={8} />
                </View>
              </Card>
            </View>

            {/* ── Recent Orders — Overpay Transactions style ── */}
            <SectionHeader
              title="Son Siparişler"
              action="Tümünü Gör"
              onAction={() => router.push('/admin/orders' as any)}
            />
            <Card>
              {/* Table header */}
              <View style={s.tableHead}>
                <Text style={[s.thCell, { flex: 2 }]}>Sipariş</Text>
                {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>}
                <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>
                <Text style={[s.thCell, { flex: 1.2 }]}>Statü</Text>
                <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>Teslim</Text>
              </View>

              {stats.recentOrders.length === 0 && (
                <Text style={s.emptyText}>Sipariş bulunamadı</Text>
              )}
              {stats.recentOrders.map((order, idx) => {
                const overdue = isOverdue(order.delivery_date, order.status);
                const isLast  = idx === stats.recentOrders.length - 1;
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[
                      s.tableRow,
                      !isLast && s.tableRowBorder,
                      hovered === order.id && s.tableRowHover,
                    ]}
                    onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                    activeOpacity={0.7}
                    // @ts-ignore
                    onMouseEnter={() => setHovered(order.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[s.orderDot, { backgroundColor: STATUS_CFG[order.status]?.color ?? '#AEAEB2' }]} />
                      <View>
                        <Text style={s.orderNo} numberOfLines={1}>{order.order_number}</Text>
                        {order.is_urgent && <Text style={s.urgentTag}>ACİL</Text>}
                      </View>
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellText, { flex: 2 }]} numberOfLines={1}>{order.doctor_name ?? '—'}</Text>
                    )}
                    <Text style={[s.cellText, { flex: 2 }]} numberOfLines={1}>{order.work_type || '—'}</Text>
                    <View style={{ flex: 1.2 }}>
                      <StatusBadge status={order.status} />
                    </View>
                    <Text style={[s.cellDate, { flex: 0.8, textAlign: 'right' }, overdue && s.cellDateOverdue]}>
                      {fmtDelivery(order.delivery_date)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 24, paddingBottom: 60 },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  dateText: { fontSize: 14, color: '#AEAEB2', fontWeight: '500' },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  loadingBox: { alignItems: 'center', paddingVertical: 80 },

  // Alert
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${CLR.red}22`,
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(255,59,48,0.08)',
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: CLR.redBg,
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  alertSub:   { fontSize: 12, color: '#AEAEB2', marginTop: 2 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 24 },

  // Charts
  chartsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  chartsCol: { flexDirection: 'column' },

  // Table
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  thCell: { fontSize: 11, fontWeight: '700', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5 },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableRowHover:  { backgroundColor: '#FAFBFC' },

  orderDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  orderNo:  { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  urgentTag: {
    fontSize: 9, fontWeight: '800', color: CLR.red,
    backgroundColor: CLR.redBg, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
    alignSelf: 'flex-start', marginTop: 2,
  },
  cellText:  { fontSize: 13, color: '#6C6C70' },
  cellDate:  { fontSize: 12, color: '#AEAEB2', fontWeight: '500' },
  cellDateOverdue: { color: CLR.red, fontWeight: '700' },

  emptyText: { padding: 24, textAlign: 'center', color: '#AEAEB2', fontSize: 13 },
});
