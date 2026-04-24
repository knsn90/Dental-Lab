import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl, ScrollView, Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { useOrders } from '../../orders/hooks/useOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { BlurFade } from '../../../core/ui/BlurFade';

// ── Tokens ──────────────────────────────────────────────────────────
const P  = '#0EA5E9';   // sky blue (doctor accent)
const BG = '#F7F9FB';
const CLR = {
  green: '#16A34A', greenBg: '#DCFCE7',
  red:   '#EF4444', redBg:   '#FEE2E2',
  amber: '#F59E0B', amberBg: '#FEF3C7',
  purple:'#7C3AED', purpleBg:'#EDE9FE',
};

// ── SVG Icons (Lucide-style) ────────────────────────────────────────
type IconName =
  | 'plus' | 'clock' | 'alert-triangle' | 'trending-up'
  | 'package' | 'calendar' | 'search' | 'filter';
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
    case 'search':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="11" cy="11" r="8" {...p}/><Line x1="21" y1="21" x2="16.65" y2="16.65" {...p}/></Svg>;
    case 'filter':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" {...p}/></Svg>;
    default: return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function getTodayLabel() {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function dateLabel(deliveryDate: string, status: WorkOrderStatus): { text: string; color: string; bg: string } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', color: '#94A3B8', bg: '#F1F5F9' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff <  0) return { text: `${Math.abs(diff)}g geç`, color: CLR.red,    bg: CLR.redBg };
  if (diff === 0) return { text: 'Bugün',                   color: CLR.purple, bg: CLR.purpleBg };
  if (diff === 1) return { text: 'Yarın',                   color: CLR.amber,  bg: CLR.amberBg };
  if (diff <= 3)  return { text: `${diff} gün kaldı`,       color: CLR.amber,  bg: CLR.amberBg };
  return { text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), color: '#64748B', bg: '#F1F5F9' };
}

// ── Mini Order Card (redesigned for doctor) ─────────────────────────
function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const overdue = isOrderOverdue(order.delivery_date, order.status);
  const cfg     = STATUS_CONFIG[order.status as WorkOrderStatus];
  const dl      = dateLabel(order.delivery_date, order.status);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={oc.card}>
      {/* Top row: status pill + order number + urgent + date chip */}
      <View style={oc.topRow}>
        <View style={[oc.statusPill, { backgroundColor: overdue ? CLR.redBg : cfg.bgColor }]}>
          <View style={[oc.statusDot, { backgroundColor: overdue ? CLR.red : cfg.color }]} />
          <Text style={[oc.statusLabel, { color: overdue ? CLR.red : cfg.color }]}>
            {overdue ? 'Gecikti' : cfg.label}
          </Text>
        </View>
        {order.is_urgent && (
          <View style={oc.urgentBadge}>
            <Text style={oc.urgentText}>ACİL</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={[oc.dateChip, { backgroundColor: dl.bg }]}>
          <Text style={[oc.dateText, { color: dl.color }]}>{dl.text}</Text>
        </View>
      </View>

      {/* Work type (main title) */}
      <Text style={oc.workType} numberOfLines={1}>{order.work_type || 'İş türü belirtilmemiş'}</Text>

      {/* Patient + order number */}
      <View style={oc.metaRow}>
        <Text style={oc.patient} numberOfLines={1}>
          {order.patient_name || 'Hasta belirtilmemiş'}
        </Text>
        <Text style={oc.orderNo}>#{order.order_number}</Text>
      </View>

      {/* Tooth chips */}
      {order.tooth_numbers && order.tooth_numbers.length > 0 && (
        <View style={oc.toothRow}>
          {order.tooth_numbers.slice(0, 5).map((t: number) => (
            <View key={t} style={oc.toothChip}>
              <Text style={oc.toothText}>{t}</Text>
            </View>
          ))}
          {order.tooth_numbers.length > 5 && (
            <View style={[oc.toothChip, { backgroundColor: 'transparent' }]}>
              <Text style={oc.toothText}>+{order.tooth_numbers.length - 5}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const oc = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 16,
    gap: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, gap: 5,
  },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },

  urgentBadge: {
    backgroundColor: CLR.redBg, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  urgentText: { fontSize: 9, fontWeight: '900', color: CLR.red, letterSpacing: 0.6 },

  dateChip: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20,
  },
  dateText: { fontSize: 11, fontWeight: '700' },

  workType: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, marginTop: 4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  patient: { flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' },
  orderNo: { fontSize: 11, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.3 },

  toothRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 4 },
  toothChip: {
    backgroundColor: '#F1F5F9', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2, minWidth: 26, alignItems: 'center',
  },
  toothText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
});

// ── Stat Chip ───────────────────────────────────────────────────────
function StatChip({ label, value, color, bg, icon }: {
  label: string; value: number; color: string; bg: string; icon: IconName;
}) {
  return (
    <View style={sc.card}>
      <View style={[sc.icon, { backgroundColor: bg }]}>
        <Icon name={icon} size={14} color={color} strokeWidth={2} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 12, gap: 4,
    alignItems: 'flex-start',
  },
  icon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, lineHeight: 26 },
  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.4, textTransform: 'uppercase' },
});

// ── Filter Chip ─────────────────────────────────────────────────────
type FilterKey = 'tumu' | 'aktif' | 'geciken' | 'teslimata_hazir' | 'teslim_edildi';
function FilterChip({ label, active, onPress, count }: {
  label: string; active: boolean; onPress: () => void; count?: number;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[fc.chip, active && fc.chipActive]}>
      <Text style={[fc.text, active && fc.textActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[fc.count, active && fc.countActive]}>
          <Text style={[fc.countText, active && fc.countTextActive]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  chipActive: { backgroundColor: P, borderColor: P },
  text:       { fontSize: 12, fontWeight: '700', color: '#64748B' },
  textActive: { color: '#FFFFFF' },
  count:            { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' },
  countActive:      { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText:        { fontSize: 10, fontWeight: '800', color: '#64748B' },
  countTextActive:  { color: '#FFFFFF' },
});

// ── Main Screen ─────────────────────────────────────────────────────
export function DoctorOrdersScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [filter, setFilter] = useState<FilterKey>('tumu');

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const today     = new Date(); today.setHours(0, 0, 0, 0);

  // ── Stats ───────────────────────────────────────────────────────
  const activeCount = orders.filter(o => o.status !== 'teslim_edildi').length;
  const overdueCount = orders.filter(o => isOrderOverdue(o.delivery_date, o.status)).length;
  const weekCount = orders.filter(o => {
    const d = new Date(o.delivery_date + 'T00:00:00');
    const diff = (d.getTime() - today.getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7 && o.status !== 'teslim_edildi';
  }).length;

  // ── Filter counts ───────────────────────────────────────────────
  const counts = useMemo(() => ({
    tumu:            orders.length,
    aktif:           orders.filter(o => o.status !== 'teslim_edildi' && !isOrderOverdue(o.delivery_date, o.status)).length,
    geciken:         overdueCount,
    teslimata_hazir: orders.filter(o => o.status === 'teslimata_hazir').length,
    teslim_edildi:   orders.filter(o => o.status === 'teslim_edildi').length,
  }), [orders, overdueCount]);

  // ── Filtered orders ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const base = orders.slice().sort((a, b) =>
      (a.delivery_date || '').localeCompare(b.delivery_date || '')
    );
    switch (filter) {
      case 'aktif':           return base.filter(o => o.status !== 'teslim_edildi' && !isOrderOverdue(o.delivery_date, o.status));
      case 'geciken':         return base.filter(o => isOrderOverdue(o.delivery_date, o.status));
      case 'teslimata_hazir': return base.filter(o => o.status === 'teslimata_hazir');
      case 'teslim_edildi':   return base.filter(o => o.status === 'teslim_edildi');
      default:                return base;
    }
  }, [orders, filter]);

  // ── Render ──────────────────────────────────────────────────────
  const ListHeader = (
    <View>
      {/* Greeting block */}
      <View style={s.header}>
        <BlurFade duration={500} delay={0} yOffset={6}>
          <Text style={s.greeting}>Merhaba{firstName ? `, Dr. ${firstName}` : ''}</Text>
        </BlurFade>
        <BlurFade duration={500} delay={60} yOffset={6}>
          <Text style={s.title}>İşlerim</Text>
        </BlurFade>
        <BlurFade duration={500} delay={120} yOffset={6}>
          <Text style={s.date}>{getTodayLabel()}</Text>
        </BlurFade>
      </View>

      {/* Stats chip row */}
      <View style={s.statsRow}>
        <StatChip label="AKTİF"      value={activeCount}  color={P}       bg="#E0F2FE"    icon="package" />
        <StatChip label="GECİKEN"    value={overdueCount} color={CLR.red} bg={CLR.redBg}  icon="alert-triangle" />
        <StatChip label="BU HAFTA"   value={weekCount}    color={CLR.green} bg={CLR.greenBg} icon="calendar" />
      </View>

      {/* Filter chip row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        <FilterChip label="Tümü"            active={filter === 'tumu'}            count={counts.tumu}            onPress={() => setFilter('tumu')} />
        <FilterChip label="Aktif"           active={filter === 'aktif'}           count={counts.aktif}           onPress={() => setFilter('aktif')} />
        <FilterChip label="Geciken"         active={filter === 'geciken'}         count={counts.geciken}         onPress={() => setFilter('geciken')} />
        <FilterChip label="Teslime Hazır"   active={filter === 'teslimata_hazir'} count={counts.teslimata_hazir} onPress={() => setFilter('teslimata_hazir')} />
        <FilterChip label="Teslim Edildi"   active={filter === 'teslim_edildi'}   count={counts.teslim_edildi}   onPress={() => setFilter('teslim_edildi')} />
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => router.push(`/(doctor)/order/${item.id}` as any)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🦷</Text>
              <Text style={s.emptyTitle}>
                {filter === 'tumu' ? 'Henüz iş emri yok' : 'Bu kategoride sipariş yok'}
              </Text>
              <Text style={s.emptySub}>
                {filter === 'tumu'
                  ? 'Yeni bir iş emri oluşturmak için aşağıdaki + düğmesine dokunun.'
                  : 'Farklı bir filtre seçmeyi deneyin.'}
              </Text>
              {filter === 'tumu' && (
                <TouchableOpacity
                  style={s.emptyCTA}
                  onPress={() => router.push('/(doctor)/new-order' as any)}
                  activeOpacity={0.85}
                >
                  <Icon name="plus" size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={s.emptyCTAText}>Yeni İş Emri</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />

      {/* Floating Action Button — only on mobile (desktop has nav) */}
      {!isDesktop && filtered.length > 0 && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => router.push('/(doctor)/new-order' as any)}
          activeOpacity={0.85}
        >
          <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  list: { padding: 20, paddingBottom: 120 },

  /* Greeting */
  header: { marginBottom: 20 },
  greeting: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  title:    { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, lineHeight: 36, marginTop: 2 },
  date:     { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 4 },

  /* Stats */
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },

  /* Filters */
  filterRow: { gap: 8, paddingBottom: 20, paddingRight: 4 },

  /* Empty */
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
  emptyIcon:  { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  emptySub:   { fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: P, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 11,
    marginTop: 12,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(14,165,233,0.30)' } as any
      : { shadowColor: P, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }),
  },
  emptyCTAText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 20, bottom: 100,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: P,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(14,165,233,0.42)' } as any
      : { shadowColor: P, shadowOpacity: 0.40, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }),
  },
});
